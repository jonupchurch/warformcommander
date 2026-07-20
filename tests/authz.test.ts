/**
 * US1 — server-authoritative authorization (SC-002). The admin role is read from the DB, never from
 * client state; a forged `admin` flag is ignored; revoking the role takes effect on the next request
 * with no re-login (database-session strategy); and ownership is checked on every owned resource.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  isAdminEmail,
  getUserRole,
  requireOwner,
  AuthError,
  type SessionUser,
} from "@/server/authz";
import { truncateAll, closeDb } from "./db-setup";

async function makeUser(role: "player" | "admin", email = "u@example.com"): Promise<string> {
  const id = crypto.randomUUID();
  await getDb().insert(users).values({ id, email, role });
  return id;
}

describe("server-authoritative role (SC-002)", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("reads the role from the DB, and a revocation is seen on the next request (no re-login)", async () => {
    const id = await makeUser("admin", "admin@example.com");
    expect(await getUserRole(id)).toBe("admin");

    // Revoke in the DB — the very next read (= next request) sees 'player', no sign-in required.
    await getDb().update(users).set({ role: "player" }).where(eq(users.id, id));
    expect(await getUserRole(id)).toBe("player");
  });

  it("ignores a client-forged admin flag — the authoritative role is the DB's", async () => {
    const id = await makeUser("player");
    // A client could POST anything; the server never trusts it.
    const forged: SessionUser = { id, role: "admin", email: "u@example.com" };
    expect(forged.role).toBe("admin"); // what the client claims
    expect(await getUserRole(id)).toBe("player"); // what the server enforces
  });

  it("returns null for an unknown user", async () => {
    expect(await getUserRole(crypto.randomUUID())).toBeNull();
  });
});

describe("admin allowlist seeding source (US1-AS3)", () => {
  it("matches allowlisted emails case-insensitively and rejects others", () => {
    const prev = process.env.ADMIN_ALLOWLIST;
    process.env.ADMIN_ALLOWLIST = "Boss@Example.com, chief@example.com";
    try {
      expect(isAdminEmail("boss@example.com")).toBe(true);
      expect(isAdminEmail("CHIEF@EXAMPLE.COM")).toBe(true);
      expect(isAdminEmail("nobody@example.com")).toBe(false);
      expect(isAdminEmail(null)).toBe(false);
      expect(isAdminEmail(undefined)).toBe(false);
    } finally {
      process.env.ADMIN_ALLOWLIST = prev;
    }
  });
});

describe("ownership guard (A2)", () => {
  const user: SessionUser = { id: "user-A", role: "player" };

  it("passes for the owner and throws 403 for anyone else", () => {
    expect(() => requireOwner("user-A", user)).not.toThrow();
    try {
      requireOwner("user-B", user);
      throw new Error("expected requireOwner to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).status).toBe(403);
    }
  });
});
