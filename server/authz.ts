/**
 * Server-side authorization primitives — the Trust-boundary rules A1–A3 (Principle II, P6), as
 * **pure + DB-only** helpers (no NextAuth import, so they're unit-testable and safe to pull into any
 * server module). The request-time guards that resolve `auth()` live in `src/server/session.ts`.
 *
 * The service layer takes an already-authenticated {@link SessionUser} (resolved at the route/action
 * boundary by `requireSession()`), never a client-supplied id — identity always originates server-side.
 */

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";

export type Role = "player" | "admin";

export interface SessionUser {
  id: string;
  role: Role;
  /** Commander handle (public identity); `null`/absent until chosen at onboarding. */
  handle?: string | null;
  /** Admin-set moderation flag (server-authoritative). A banned session is rejected at the boundary. */
  banned?: boolean;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

/** A rejected authorization check. `status` mirrors the HTTP code a route handler would return. */
export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * A2 — require the actor to own the resource. Pure and total: throws {@link AuthError} 403 on any
 * mismatch, so no cross-user read/write/delete can slip through (US2-AS5, US3 ownership).
 */
export function requireOwner(resourceUserId: string, user: SessionUser): void {
  if (resourceUserId !== user.id) throw new AuthError(403, "not the owner of this resource");
}

/** A3 — require the admin role on an already-resolved session user. Throws 403 otherwise. */
export function assertAdmin(user: SessionUser): void {
  if (user.role !== "admin") throw new AuthError(403, "admin role required");
}

/**
 * The **server-authoritative** role read: the current `users.role` straight from the DB — what the
 * database-session strategy consults every request, so a role revocation (admin → player) takes
 * effect on the next request with no re-login (SC-002). `null` if the user does not exist.
 */
export async function getUserRole(userId: string): Promise<Role | null> {
  const rows = await getDb()
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.role ?? null;
}

/** The comma-separated `ADMIN_ALLOWLIST` of Google emails, normalized. Read **server-side** only. */
function adminAllowlist(): Set<string> {
  return new Set(
    (process.env.ADMIN_ALLOWLIST ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Whether an email is on the server-side admin allowlist (FR-003). Never derived from client state. */
export function isAdminEmail(email?: string | null): boolean {
  return !!email && adminAllowlist().has(email.toLowerCase());
}
