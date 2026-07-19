# Research: Accounts & Persistence

**Feature**: `007-accounts-persistence` | **Date**: 2026-07-19 | **Plan**: [plan.md](./plan.md)

Resolves the technical unknowns behind auth + persistence on the repo's **existing** DB wiring
(Neon Postgres + Drizzle via **postgres-js**, lazy `getDb()`, no Proxy). Format per decision:
**Decision / Rationale / Alternatives considered**, sources cited inline.

The unknowns cluster into three workstreams — **(A) Auth.js + Drizzle + Google + postgres-js on
Next.js 16**, **(B) Drizzle schema & snapshot patterns**, **(C) Neon branching + migration
workflow** — each largely independent.

---

## Workstream A — Auth.js (NextAuth v5) + Drizzle adapter + Google on Next.js 16 / Vercel

### A1. Auth library → **Auth.js (NextAuth v5) + `@auth/drizzle-adapter`, Google provider**

- **Decision**: Use **Auth.js / NextAuth v5** (the `next-auth@5` beta line, the current stable
  App-Router API) with the official **`@auth/drizzle-adapter`** and the built-in **Google**
  provider. Single `auth.ts` exports `{ handlers, auth, signIn, signOut }`; the route handler is
  the two-line `app/api/auth/[...nextauth]/route.ts` re-export of `handlers`.
- **Rationale**: This is the first-party, best-documented path for Google OAuth on Next.js 16 App
  Router, and the Drizzle adapter speaks Drizzle-over-postgres-js directly (no second client).
  Env vars `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` are auto-inferred by the Google
  provider, and the callback URL is `/api/auth/callback/google`. Email login is a **fast-follow**:
  the adapter's `verificationTokens` table already backs a magic-link/Email provider, so adding it
  later is additive.
- **Alternatives considered**: **Better Auth** (Drizzle-native, rising in 2025–26) — a strong
  option and worth a look, but Auth.js has the deepest Next-App-Router + Google track record and
  the Drizzle adapter is turnkey; keep Better Auth as the documented fallback if Auth.js friction
  appears. **Clerk / hosted auth** — rejected: pulls identity out of our own Postgres (the schema
  Features 8–12 join against must be *ours*), adds cost/vendor coupling, and fights P6's
  server-authoritative, self-owned data posture. Raw OAuth by hand — rejected: reinvents session
  security we get for free.
- Sources: [Auth.js Drizzle adapter](https://authjs.dev/getting-started/adapters/drizzle),
  [Auth.js Next.js reference](https://authjs.dev/reference/nextjs),
  [Reetesh: Auth.js v5 + Drizzle for Next App Router](https://reetesh.in/blog/authentication-using-auth.js-v5-and-drizzle-for-next.js-app-router),
  [LogRocket: best Next.js auth libraries 2026](https://blog.logrocket.com/best-auth-library-nextjs-2026/).

### A2. Session strategy → **database sessions (not JWT)** for server-authority (P6)

- **Decision**: Use the **database session strategy** (`session: { strategy: "database" }`, the
  default when a database adapter is present). Sessions live in the `session` table; the browser
  holds only an opaque HttpOnly session-token cookie.
- **Rationale**: **Server-authoritative** identity (P6) wants exactly what DB sessions give:
  the server can **revoke or modify a session at any time**, so an **admin-role revocation takes
  effect on the next request without forcing re-login**, and "sign out everywhere" is possible.
  With the JWT strategy a role is baked into the token until it expires — you cannot revoke admin
  mid-session without a server-side blocklist (which just re-adds a database). The admin gate
  (Feature 12) is a security boundary, so real-time server control wins over JWT's
  statelessness/scale (which we do not need at this scale). The known JWT reason-to-exist —
  edge-runtime DB inaccessibility — **does not apply on Next.js 16**, where `middleware`/`proxy.ts`
  runs on the **Node runtime** (see A4).
- **Alternatives considered**: **JWT sessions** — rejected for the admin boundary: can't revoke a
  role before token expiry without a server blocklist; the usual JWT win (no DB round-trip, edge
  friendliness) is moot here (Node-runtime proxy, small scale, and we already hit the DB every
  request for game data). **JWT + DB hybrid** — unnecessary complexity for our needs.
- Sources: [Auth.js session strategies](https://authjs.dev/concepts/session-strategies),
  [Auth.js role-based access control](https://authjs.dev/guides/role-based-access-control),
  [next-auth discussion #1571 (JWT vs DB tradeoffs)](https://github.com/nextauthjs/next-auth/discussions/1571),
  [Stytch: JWTs vs sessions](https://stytch.com/blog/jwts-vs-sessions-which-is-right-for-you/).

### A3. The **"no Proxy around the db client"** gotcha → the repo already gets this right

- **Decision**: Pass the **real** Drizzle instance from `getDb()` straight into
  `DrizzleAdapter(getDb())`. Do **not** wrap `getDb()`'s return value in a JS `Proxy` or any
  introspection wrapper.
- **Rationale**: The Drizzle adapter **detects the underlying driver** (pg / postgres-js / mysql /
  sqlite) by introspecting the passed instance and returns the matching adapter implementation. A
  `Proxy` (or other wrapper that hides/forwards properties) defeats that detection and the adapter
  misbehaves ("not a function" / wrong-dialect errors). The repo's `db/index.ts` **deliberately
  avoids a Proxy** (its own comment: "avoids a Proxy wrapper (which breaks libraries that
  introspect the client object)") and returns a plain `drizzle(client, { schema })` — exactly what
  the adapter needs. This is a *pre-satisfied* constraint; the plan must not regress it.
- **Alternatives considered**: A Proxy for lazy connection — rejected precisely because it breaks
  the adapter; laziness is achieved instead via `getDb()` + NextAuth lazy init (A4), which needs no
  Proxy.
- Sources: [Auth.js Drizzle adapter](https://authjs.dev/getting-started/adapters/drizzle),
  [next-auth issue #12411 (AdapterError w/ Drizzle)](https://github.com/nextauthjs/next-auth/issues/12411),
  [next-auth discussion #7005 (Drizzle support)](https://github.com/nextauthjs/next-auth/discussions/7005),
  repo `db/index.ts`.

### A4. Build-safety with lazy `getDb()` → **NextAuth v5 lazy initialization**

- **Decision**: Initialize NextAuth **lazily** — pass a **function** to `NextAuth`, and call
  `getDb()` **inside** it, so the DB client is created on first request, not at module load:
  ```ts
  // auth.ts (Node runtime)
  export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
    adapter: DrizzleAdapter(getDb(), { usersTable, accountsTable, sessionsTable, verificationTokensTable }),
    session: { strategy: "database" },
    providers: [Google],
    callbacks: { /* attach role + userId to session (A5) */ },
  }));
  ```
- **Rationale**: `getDb()` **throws when `DATABASE_URL` is absent** (by design, so `next build`
  stays safe). If the adapter called `getDb()` at top-level module evaluation, importing `auth.ts`
  during `next build` (which loads route modules) would throw. NextAuth v5 supports **lazy
  initialization** — passing `(req) => config` defers config construction (and thus `getDb()`)
  until a request arrives, where `DATABASE_URL` is present. This reconciles the repo's build-safe
  lazy accessor with the adapter's need for a real instance — **without** a Proxy (A3).
- **Alternatives considered**: Eager `DrizzleAdapter(getDb())` at module scope — rejected: breaks
  `next build` when the env is absent. A Proxy to defer connection — rejected (A3).
- Sources: [Auth.js Next.js reference — lazy initialization](https://authjs.dev/reference/nextjs),
  [NextAuth initialization docs](https://next-auth.js.org/configuration/initialization),
  repo `db/index.ts`.

### A5. Admin role & session shape → **`role` column on `users`, surfaced via the `session` callback, checked server-side**

- **Decision**: Add a **`role`** enum column (`player` | `admin`) to the `users` table, seeded from
  a **server-side allowlist** (an env-var list of admin emails checked in the `signIn`/`events`
  callback, or a one-time DB seed). Surface `role` + `userId` on the session via the **`session`
  callback** so server code (`auth()` in RSC/route handlers/`proxy.ts`) reads it, and **always
  re-check authorization server-side** — never trust a client value (Principle II, P6).
- **Rationale**: With DB sessions the `session` callback receives the DB `user`, so
  `session.user.role`/`session.user.id` are populated from the server's record every request →
  role changes are immediate (A2). Feature 12's admin gate is then a server-side
  `const s = await auth(); if (s?.user.role !== "admin") return 403;` — no client input involved.
  An **allowlist** (rather than a self-serve toggle) keeps admin grant a deliberate, out-of-band
  act (design doc §16.2).
- **Alternatives considered**: JWT `token.role` — rejected (A2, can't revoke). A separate
  `admins` table — equivalent; a `role` column is simpler and the RBAC guide's canonical shape.
- Sources: [Auth.js role-based access control](https://authjs.dev/guides/role-based-access-control),
  [Auth.js database models](https://authjs.dev/concepts/database-models).

### A6. Next.js 16 runtime & the split-config question → **single Node-runtime config; split optional**

- **Decision**: Keep auth config in one `auth.ts` on the **Node runtime**. The classic v5
  **split config** (`auth.config.ts` edge-safe + `auth.ts` with the adapter) is **optional** here,
  because on **Next.js 16 the middleware file is `proxy.ts` running on the Node runtime**, so the
  DB (and the adapter) are reachable from it — the edge-DB incompatibility the split works around
  no longer applies. Adopt the split only if a genuine edge constraint reappears.
- **Rationale**: The split-config dance exists so the *edge* middleware doesn't try to touch the
  DB via a non-edge driver. Next.js 16 removed that constraint by moving middleware to Node. Route
  handlers that resolve battles and touch the DB already declare `runtime = "nodejs"` (Feature 1);
  auth's DB adapter is fine on the same runtime. Fewer files, one source of truth.
- **Alternatives considered**: Force JWT + split config for edge middleware — rejected: reintroduces
  JWT's non-revocable-role problem (A2) to satisfy a constraint that no longer exists on Next 16.
- Sources: [Auth.js edge compatibility](https://authjs.dev/guides/edge-compatibility),
  [Auth.js migrating to v5 (split config)](https://authjs.dev/getting-started/migrating-to-v5),
  [Auth.js v5 + Next.js 16 guide](https://dev.to/huangyongshan46a11y/authjs-v5-with-nextjs-16-the-complete-authentication-guide-2026-2lg).

---

## Workstream B — Drizzle schema & snapshot patterns

### B1. Auth-adapter tables → **the Auth.js default Postgres shape, verbatim, in `db/schema.ts`**

- **Decision**: Define the adapter tables exactly as the Auth.js Postgres schema specifies
  (`user`, `account`, `session`, `verificationToken`, `authenticator`) so `DrizzleAdapter` works
  unmodified, and **extend `users`** with our game columns (`role`, `handle`, `isBot`, timestamps).
  Verbatim reference shape (from the adapter source):
  ```ts
  export const users = pgTable("user", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").unique(),
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image"),
    // --- game extensions ---
    handle: text("handle").unique(),
    role: rolePgEnum("role").notNull().default("player"),
    isBot: boolean("isBot").notNull().default(false),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  });
  export const accounts = pgTable("account", { /* userId, type, provider, providerAccountId, tokens; PK(provider, providerAccountId) */ });
  export const sessions = pgTable("session", { sessionToken: text().primaryKey(), userId, expires });
  export const verificationTokens = pgTable("verificationToken", { /* identifier, token, expires; PK(identifier, token) */ });
  ```
- **Rationale**: The adapter maps to these column names/types; deviating means custom-mapping every
  field. Extending `users` with extra columns is explicitly supported (the adapter only reads the
  columns it knows). Keep adapter table **names** at the Auth.js defaults; game tables use our
  own names.
- **Alternatives considered**: Renaming adapter tables (e.g. `auth_users`) via the adapter's
  custom-table option — viable but buys nothing and risks mis-mapping; keep defaults.
- Sources: [Auth.js Drizzle adapter (pg schema)](https://authjs.dev/getting-started/adapters/drizzle),
  [`adapter-drizzle/src/lib/pg.ts`](https://github.com/nextauthjs/next-auth/blob/main/packages/adapter-drizzle/src/lib/pg.ts),
  [next-auth #9466 (custom user table)](https://github.com/nextauthjs/next-auth/issues/9466).

### B2. Squad config storage → **typed `jsonb` (`.$type<SquadConfig>()`), not normalized**

- **Decision**: Store a squad's 5-unit config as a single **`jsonb`** column typed
  `.$type<SquadConfig>()` (the Feature-1 `Squad`/`Army` shape), plus **derived scalar columns**
  (`powerRating`, a `schemaVersion`) for query/gating. Validate with the shared Feature-1
  `validate()` **before** insert.
- **Rationale**: The squad config **is** Feature 1's typed contract (P8, single source of truth).
  Normalizing it into `machine`/`loadout`/`dial` SQL tables would re-implement the sim's type
  system in DDL and **drift** from the Rust/TS model on every content change — the exact
  duplication P8 forbids. Drizzle `.$type<T>()` gives end-to-end TS typing on the jsonb with zero
  runtime cost; postgres-js returns jsonb as parsed objects. This mirrors the replay-storage
  decision (Feature 1 research C3): structured game artifacts live as typed jsonb, with only the
  *queried* fields promoted to scalar columns. TOAST compresses anything large automatically.
- **Alternatives considered**: **Fully normalized** per-unit tables — rejected: heavy, drift-prone,
  and a squad is always read/written whole (no per-unit query need). **`text` blob** — rejected:
  loses jsonb typing/queryability for free wins. **Separate columns per queried field** — done
  *in addition* (power rating), not instead.
- Sources: [Drizzle column types — jsonb `.$type`](https://orm.drizzle.team/docs/column-types),
  [JSON columns in Drizzle](https://jsonic.io/guides/json-drizzle),
  Feature 1 [research.md C3](../001-battle-sim-core/research.md), [replay-format §Storage](../001-battle-sim-core/contracts/replay-format.md).

### B3. Immutable defense snapshots → **copy-on-designate row; never `UPDATE` the config**

- **Decision**: Model a defense designation as **inserting** a `defense_snapshots` row that holds a
  **frozen copy** of the squad's `config` jsonb at designation time. The snapshot's config is
  **never updated in place**: editing the source squad touches only `squads.config`;
  re-designating **inserts a new snapshot** and **deactivates** the old one (`active=false`). The
  ≤3 cap and slot distinctness are enforced by a **partial unique index** on
  `(userId, defenseSlot) WHERE active` with `defenseSlot ∈ {0,1,2}`; pool exclusivity by a
  `squads.defenseSlot` marker (`NULL` = attackable) with a matching partial unique index.
- **Rationale**: Copy-on-write is the simplest correct immutability guarantee — because the
  snapshot is a *different row* from the live squad, an edit to the live squad is isolated by
  construction (US3-AS2, SC-004). Enforcing "≤3 active" as a **partial unique index** makes the cap
  a **database invariant**, not just app logic, so a concurrent 4th designation is rejected by the
  constraint (SC-005), satisfying the trust boundary structurally. Retaining superseded snapshots
  (soft-deactivate) keeps historical replays valid (FR-014).
- **Alternatives considered**: A single `defense` column on `squads` mutated in place — rejected:
  can't be immutable and can't hold 3. **Postgres row-versioning / temporal tables** — overkill;
  an explicit `active` flag + insert-only config is clearer. **App-only count check** — rejected:
  loses to races; the partial unique index is the guard.
- Sources: [Drizzle indexes & constraints (partial `.where`)](https://orm.drizzle.team/docs/indexes-constraints),
  [Drizzle Postgres best-practices (partial indexes)](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717),
  design doc §16.2 (snapshot semantics).

### B4. Replay storage → **`jsonb` `.$type<Replay>()` + scalar provenance (per Feature-1 contract)**

- **Decision**: One `replays` row per match: a `jsonb` replay column typed `.$type<Replay>()`,
  plus first-class scalar columns `seed`, `rulesetHash`, `formatVersion`, `winner` — the storage
  shape Feature 1's [replay-format §Storage](../001-battle-sim-core/contracts/replay-format.md)
  already pins. Army inputs live inside the replay `meta` (for regenerate-not-migrate); no separate
  armies column. Let TOAST compress; **no `bytea`, no manual gzip, no Blob offload** at this size.
- **Rationale**: This is not an open question — Feature 1 already decided it. Honor it: `jsonb`
  gives the TS-typed object for free via postgres-js + Drizzle; scalar columns let the server
  filter/gate without parsing the blob; persisting seed+inputs+rulesetHash makes a `formatVersion`
  bump a server-side re-emission (FR-018). The documented escape hatch (MessagePack-in-`bytea`)
  stays unbuilt unless replays exceed multiple MB.
- **Alternatives considered**: all covered in Feature 1 research C1–C5; nothing changes here.
- **Seed column**: store as **`numeric(20,0)`** (or `text`) — a u64 exceeds signed `bigint`
  (max ≈ 9.2×10¹⁸ < u64 max ≈ 1.8×10¹⁹); numeric/text is lossless and matches the JSON replay's
  "u64 as string" rendering.
- Sources: Feature 1 [replay-format contract](../001-battle-sim-core/contracts/replay-format.md)
  and [research.md C3–C5](../001-battle-sim-core/research.md),
  [Drizzle numeric/bigint column types](https://orm.drizzle.team/docs/column-types).

### B5. Net-victory standing → **maintained cache table, reconcilable from `matches`**

- **Decision**: Keep a `ladder_standings` cache keyed by `userId` — `attackWins`, `attackLosses`,
  `defenseWins`, `defenseLosses`, and the derived `netVictories = attackWins − defenseLosses`, plus
  career counters (matches, damage, streaks) — updated **transactionally** in the same write that
  records a **ranked** match. The `matches` table remains the source of truth; the cache is
  reconcilable by re-aggregation.
- **Rationale**: The Ladder leaderboard (Feature 9) and Profile career card (Feature 10) need cheap
  ordered reads and per-week aggregates that a per-request re-aggregation over all `matches` would
  make expensive as history grows. A maintained counter row is O(1) to read and update; keeping it
  reconcilable (SC-007) guards against drift. A SQL **view** over `matches` is the simpler
  alternative and a fine fallback, but the cache matches the mockups' weekly/monthly rollups and
  the leaderboard's scale.
- **Alternatives considered**: **Pure SQL view / on-the-fly aggregate** — simplest and always
  correct, kept as the reconciliation oracle; but heavier reads at ladder scale. **Event-sourced
  standing** — overkill for v1. Seasons/tiers/MMR — deferred to Feature 9 (this only provides the
  net-victory substrate).
- Sources: design doc §13 (net victories), Ladder/Profile mockups,
  [Drizzle read/query patterns](https://orm.drizzle.team/docs/rqb).

---

## Workstream C — Neon branching & migration workflow

### C1. Dev/prod branching → **create a Neon dev branch; test all DDL there before prod**

- **Decision**: Create a **Neon dev branch** (a copy-on-write clone of the production/primary
  branch) and point local `.env.local`'s `DATABASE_URL` at it. Run all initial table creation and
  iterate there; apply to the **primary (production) branch** only once the migration is reviewed.
  This directly addresses the STATUS/memory note that the repo currently tests against prod but
  wants a dev branch before creating tables.
- **Rationale**: A Neon branch is an isolated, instant, copy-on-write clone that doesn't load or
  risk production; it's the intended workflow for schema work and CI. Feature 7 is the first
  feature to create real tables, so establishing the dev-branch habit here is the right moment.
- **Alternatives considered**: Continue testing on prod — rejected (the note explicitly wants a dev
  branch before tables exist). A separate local Postgres — also fine for pure-local dev
  (postgres-js supports it), but a Neon dev branch mirrors prod's behavior (pooler, `prepare:false`)
  most faithfully.
- Sources: [Neon branching](https://neon.com/docs/introduction/branching),
  [Neon + Drizzle guide](https://neon.com/docs/guides/drizzle),
  [Neon automated branching with GitHub Actions](https://neon.com/guides/neon-github-actions-authomated-branching),
  STATUS.md / MEMORY current-build-state note.

### C2. Migration tooling → **drizzle-kit `generate` (SQL migrations), applied via the repo's `db:*` scripts**

- **Decision**: Use **`drizzle-kit generate`** to produce versioned SQL migration files in
  `db/migrations` (already the configured `out` in `drizzle.config.ts`), and apply them with the
  repo's dotenv-wrapped scripts. Prefer `db:generate` (reviewable SQL committed to the repo) over
  `db:push` for anything headed to production; `db:push` is fine for fast dev-branch iteration.
  Add a `db:migrate` apply step (drizzle-kit migrate / a small runner) so CI applies committed SQL
  to the target branch. `db:studio` remains for inspection.
- **Rationale**: The repo already wires `db:generate` / `db:push` / `db:studio` via `dotenv -e
  .env.local -- drizzle-kit ...` (drizzle-kit doesn't auto-load `.env.local`). Generated,
  committed SQL migrations are the reviewable, prod-safe path (SC-008); push is the quick loop on
  the dev branch. Production `DATABASE_URL` comes from the Vercel/Neon env, not `.env.local`.
- **Alternatives considered**: `db:push` straight to prod — rejected for production changes (no
  reviewable artifact, easy to drift). A separate migration tool — unnecessary; drizzle-kit is
  already configured.
- Sources: [Drizzle + Neon tutorial](https://orm.drizzle.team/docs/tutorials/drizzle-with-neon),
  [Drizzle Kit migrate/generate](https://orm.drizzle.team/docs/kit-overview),
  repo `drizzle.config.ts` + `package.json` `db:*` scripts.

### C3. Driver correction → **postgres-js, NOT neon-http** (STATUS.md is stale)

- **Finding**: STATUS.md's Tech-stack line still says the driver is `@neondatabase/serverless` /
  `drizzle-orm/neon-http`. **The actual repo code uses `drizzle-orm/postgres-js`** (`db/index.ts`,
  `postgres` in `package.json`) — chosen so one client works against a local Postgres in dev and
  Neon's pooled endpoint in prod, with `prepare:false` for PgBouncer compatibility, and to enable
  transactions (needed for atomic designate/record operations). The plan's Technical Context
  corrects this; **do not reintroduce `neon-http`** — it can't reach a local Postgres and doesn't
  support the interactive transactions this feature's designate/record flows use. (The
  orchestrator will fix STATUS.md itself.)
- **Rationale**: postgres-js returns `jsonb` as parsed objects and `bytea` as native `Buffer`, and
  supports real transactions (`db.transaction(...)`) — both load-bearing for immutable snapshots and
  standing updates. neon-http is stateless HTTP (no interactive transactions), wrong for these
  flows.
- Sources: repo `db/index.ts` / `package.json`, Feature 1 [research.md C3](../001-battle-sim-core/research.md),
  [Neon serverless driver notes](https://neon.tech/blog/serverless-driver-ga).

---

## Cross-cutting decisions (summary for plan.md Technical Context)

| Area | Decision |
|---|---|
| **Auth** | Auth.js (NextAuth v5) + `@auth/drizzle-adapter` + Google provider; email login fast-follow via `verificationTokens` |
| **Session** | **Database sessions** (server-authoritative; instant role revocation) — enabled by Next.js 16 Node-runtime `proxy.ts` |
| **Adapter wiring** | `DrizzleAdapter(getDb())` via **NextAuth lazy init**; **no Proxy** around the client (adapter driver detection); repo `db/index.ts` already compliant |
| **Admin role** | `users.role` enum from a server-side allowlist; surfaced via `session` callback; **authz always checked server-side** (Principle II, P6) |
| **Squad storage** | Feature-1 `Squad` config as typed **`jsonb` `.$type<SquadConfig>()`**, validated by shared `validate()` before insert; derived scalar `powerRating` |
| **Defense snapshots** | **Copy-on-designate** immutable rows; ≤3 cap + slot distinctness + pool exclusivity as **partial unique indexes** (DB invariants) |
| **Replay storage** | `jsonb` `.$type<Replay>()` + scalar provenance (seed/rulesetHash/formatVersion/winner) — Feature-1 contract, unchanged; seed as `numeric(20,0)` |
| **Standing** | Maintained `ladder_standings` cache (net victories = attack wins − defense losses), reconcilable from `matches` |
| **News** | One unified `posts` table (editorial + auto balance/devlog), nullable author, published-index read |
| **Driver** | **postgres-js** (transactions, local+Neon) — STATUS.md's `neon-http` line is stale and corrected here |
| **Migrations** | **Neon dev branch first**, drizzle-kit `generate` (committed SQL) via the repo's dotenv `db:*` scripts, then apply to prod |

All spec unknowns (auth library/strategy, adapter wiring on the existing db, snapshot pattern,
standing derivation, Neon branching) are resolved. No unresolved unknowns remain for the schema
design (data-model.md) or the contracts.
