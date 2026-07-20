/**
 * Auth.js (NextAuth v5) configuration — Feature 7, User Story 1.
 *
 * Google OAuth for all users, on the repo's existing **postgres-js** Drizzle instance via
 * `@auth/drizzle-adapter`, with **database sessions** so identity and role are server-authoritative
 * (P6): a role change takes effect on the next request with no re-login, and "sign out everywhere"
 * is a `sessions` delete.
 *
 * Two invariants from the DB wiring (research A3/A4): the config is a **lazy factory** so `getDb()`
 * is deferred to request time (`next build` stays safe without `DATABASE_URL`), and the adapter gets
 * the **real** Drizzle instance — never a Proxy (which would break the adapter's driver detection).
 * The `db/index.ts` `getDb()` already satisfies both.
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { isAdminEmail } from "@/server/authz";

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" }, // server-authoritative (research A2)
  trustHost: true, // localhost dev + tests; on Vercel the host is trusted anyway
  providers: [Google], // AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET auto-inferred
  callbacks: {
    // Database-session callback receives the fresh DB user each request → role is always current.
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
      }
      return session;
    },
  },
  events: {
    // Seed the admin role from the server-side allowlist on sign-in (promote-only; revocation is a
    // DB update, honored on the next request by the database-session strategy).
    async signIn({ user }) {
      if (user.id && isAdminEmail(user.email) && user.role !== "admin") {
        await getDb().update(users).set({ role: "admin" }).where(eq(users.id, user.id));
      }
    },
  },
}));
