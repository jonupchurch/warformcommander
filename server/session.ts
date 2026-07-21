/**
 * Request-time session guards (A1) — the boundary layer that resolves the server session via
 * `auth()` and hands an authenticated {@link SessionUser} to the service layer. Kept separate from
 * `authz.ts` so the pure trust-boundary helpers stay free of the NextAuth import.
 *
 * Used by Server Actions / route handlers (and Feature 12's admin gate). The service functions in
 * `src/server/` never call `auth()` themselves — they receive the resolved actor.
 */

import { auth } from "@/auth";

import { AuthError, assertAdmin, type SessionUser } from "./authz";

/**
 * A1 — require an authenticated session; returns the session user (id + server-derived role) or
 * throws {@link AuthError} 401. The role rides the database session (read fresh from the DB each
 * request), so it is never a client-forged value.
 */
export async function requireSession(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) throw new AuthError(401, "authentication required");
  // A banned account is rejected at the authz boundary — every authed action/route bounces (403),
  // and because the flag rides the DB session it takes effect on the next request (no re-login).
  if (session.user.banned) throw new AuthError(403, "account suspended");
  return session.user;
}

/**
 * A3 — require an authenticated **admin** session, evaluated server-side from the session/DB
 * (FR-003). A client that forges an `admin` flag is ignored. Throws 401 (anonymous) or 403 (non-admin).
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSession();
  assertAdmin(user);
  return user;
}
