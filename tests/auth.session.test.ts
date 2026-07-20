/**
 * US1 — Google sign-in creates exactly one user + one account on first sign-in and matches the
 * existing user on repeat (SC-001). Exercised through the **Drizzle adapter** (the same methods
 * NextAuth calls during the OAuth round-trip) against the local dev DB.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { Adapter } from "next-auth/adapters";

import { getDb } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { truncateAll, closeDb } from "./db-setup";

const adapter = DrizzleAdapter(getDb(), {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
}) as Required<Adapter>;

/** Simulate the adapter side of a Google OAuth sign-in for a given account id. */
async function signInWithGoogle(email: string, providerAccountId: string, name = "Cmdr") {
  const existing = await adapter.getUserByAccount({ provider: "google", providerAccountId });
  if (existing) return existing; // returning user — no new rows
  const user = await adapter.createUser({
    id: crypto.randomUUID(),
    email,
    emailVerified: null,
    name,
    image: null,
    role: "player",
  });
  await adapter.linkAccount({
    userId: user.id,
    type: "oidc",
    provider: "google",
    providerAccountId,
    access_token: "at",
    token_type: "bearer",
    scope: "openid email profile",
    id_token: "it",
  });
  return user;
}

describe("auth adapter round-trip (SC-001)", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("first sign-in creates exactly one user and one account", async () => {
    const user = await signInWithGoogle("player@example.com", "google-1001");
    expect(user.id).toBeTruthy();
    expect(await getDb().select().from(users)).toHaveLength(1);
    expect(await getDb().select().from(accounts)).toHaveLength(1);
  });

  it("repeat sign-in matches the existing user (no duplicate)", async () => {
    const first = await signInWithGoogle("player@example.com", "google-1001");
    const second = await signInWithGoogle("player@example.com", "google-1001");
    expect(second.id).toBe(first.id);
    expect(await getDb().select().from(users)).toHaveLength(1);
    expect(await getDb().select().from(accounts)).toHaveLength(1);
  });

  it("a different Google account creates a distinct user", async () => {
    const a = await signInWithGoogle("a@example.com", "google-1001");
    const b = await signInWithGoogle("b@example.com", "google-2002");
    expect(b.id).not.toBe(a.id);
    expect(await getDb().select().from(users)).toHaveLength(2);
  });
});
