# Contract: Auth (Google OAuth + server-side sessions + admin role)

**Feature**: `007-accounts-persistence` | **Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

The authentication surface: **Auth.js (NextAuth v5)** + **`@auth/drizzle-adapter`** + the **Google**
provider, on the repo's existing **postgres-js** Drizzle instance. Decisions in
[../research.md](../research.md) A1–A6.

## Files

```
auth.ts                                  # NextAuth config (Node runtime) — exports handlers/auth/signIn/signOut
app/api/auth/[...nextauth]/route.ts      # export const { GET, POST } = handlers  (two lines)
db/schema.ts                             # users/accounts/sessions/verificationTokens (Tier A) + game tables
src/db/types.ts                          # SquadConfig/Replay/PresetConfig re-exports for .$type<>()  (no engine import)
proxy.ts (optional)                      # Next.js 16 middleware (Node runtime) — route guards via auth()
```

## Configuration (`auth.ts`)

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";

// LAZY init: the function defers getDb() to request time so `next build` stays safe
// (getDb throws without DATABASE_URL). Pass the REAL drizzle instance — never a Proxy
// (the adapter introspects the driver; a Proxy breaks detection). See research A3/A4.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },          // server-authoritative (research A2)
  providers: [Google],                        // AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET auto-inferred
  callbacks: {
    async session({ session, user }) {         // DB-session callback receives the DB user
      session.user.id = user.id;
      session.user.role = user.role;           // 'player' | 'admin' — from the DB, every request
      return session;
    },
  },
  events: {
    async signIn({ user }) {                    // seed admin role from a server-side allowlist
      if (isAdminEmail(user.email)) await promoteToAdmin(user.id); // env allowlist → users.role
    },
  },
}));
```

Route handler:

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
export const runtime = "nodejs"; // DB adapter needs Node (not edge)
```

## Environment variables

| Var | Purpose |
|---|---|
| `AUTH_SECRET` | session/token signing (required) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client (Google Cloud Console) |
| `AUTH_URL` (prod) | canonical origin for the callback `…/api/auth/callback/google` |
| `ADMIN_ALLOWLIST` | comma-separated admin emails, read **server-side** to seed `users.role` |
| `DATABASE_URL` | existing — Neon (prod) / local Postgres (dev), consumed by `getDb()` |

## Session shape (consumers read this)

```ts
type SessionUser = {
  id: string;              // users.id — the owner key for all authz checks
  name?: string; email?: string; image?: string;
  role: "player" | "admin";
};
// Server: const session = await auth();  // RSC / route handler / proxy.ts
```

## Guarantees

1. **Google sign-in** creates one `users` + one `accounts` row on first sign-in; returning users
   match the existing record (SC-001). A failed/cancelled OAuth round-trip creates no user.
2. **Server-authoritative sessions** — identity/role come from the DB session, not client state; a
   role change (or revocation) takes effect on the **next request with no re-login** (SC-002,
   research A2/A5). "Sign out everywhere" is possible (delete the user's `sessions`).
3. **Admin gate** — `session.user.role === "admin"` is read **server-side**; a client-forged admin
   flag is ignored (Principle II, P6). Feature 12 gates every admin action on it.
4. **Email fast-follow** — adding the Email provider is additive (the `verificationTokens` table is
   already present); no model change (FR-005).
5. **No Proxy** around the Drizzle client (research A3); the repo's `getDb()` already returns a
   plain instance — do not regress it.

## Route-guard pattern (Feature 12 and any owned page)

```ts
// server component / route handler / proxy.ts
const session = await auth();
if (!session) redirect("/api/auth/signin");            // anonymous
if (adminOnly && session.user.role !== "admin") return forbidden(); // server-side authz
```

## Non-goals

- The admin **console UI** and live ruleset editing (Feature 12) — this only provides the role +
  the gate. Email/passkey providers beyond the schema hooks. Rate-limiting / abuse (platform layer).
