---
description: "Task list for Feature 7 — Accounts & Persistence"
---

# Tasks: Accounts & Persistence

**Input**: Design documents from `specs/007-accounts-persistence/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: **INCLUDED and non-optional.** This feature owns **trust boundaries** (auth, authz,
server-only result writes — Principle II + P6) and the **defense-snapshot immutability / pool
exclusivity** guarantees (P5/P6). Its Success Criteria (SC-001…SC-008) are executable, and the
security-critical ones are written **before** the code they guard.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 (maps to spec.md); Setup/Foundational/Shared/Polish carry no story label
- Paths are repo-root absolute (e.g. `db/schema.ts`, `src/server/…`). Builds on the **existing**
  `db/index.ts` (postgres-js, lazy `getDb()`, **no Proxy**) — never rewrite it.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, the Neon dev branch, and auth/schema scaffolding.

- [ ] T001 Add auth deps to `package.json`: `next-auth@5` (Auth.js v5) + `@auth/drizzle-adapter`. Do **not** add `@neondatabase/serverless`/neon-http (research C3). Run install.
- [ ] T002 Create a **Neon dev branch** and point local `.env.local` `DATABASE_URL` at it (research C1); add `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ADMIN_ALLOWLIST` to `.env.local` and document them in `.env.example`. All table creation is tested on the dev branch before prod.
- [ ] T003 [P] Add a `db:migrate` script to `package.json` (dotenv-wrapped `drizzle-kit migrate`) alongside the existing `db:generate/push/studio`; confirm `drizzle.config.ts` already targets `db/schema.ts` + `out: db/migrations` (no change needed).
- [ ] T004 [P] Register a Google OAuth client (Google Cloud Console) with callback `…/api/auth/callback/google` for local + prod origins; record the client id/secret in `.env.local` (dev) and Vercel env (prod).
- [ ] T005 [P] Choose/configure the unit test runner (Vitest or repo standard) with a **Neon dev-branch** test DB connection and a per-test transaction/rollback or truncate helper in `tests/db-setup.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The full schema (Tier A auth + Tier B game), the migration, the shared jsonb types,
and the authz guards that **every** story imports. Nothing in Phase 3+ begins until this is done.

**⚠️ CRITICAL**: This is the schema Features 8–12 build on — get it right (data-model.md).

- [ ] T006 Implement `db/types.ts`: re-export `SquadConfig` (Feature-1 `Army`/`Squad`), `Replay`, and `PresetConfig` from the Feature-1 TS mirror under `src/sim/` — **types only**, no engine/WASM import (P6). Used by `.$type<>()` in the schema.
- [ ] T007 Fill `db/schema.ts` **Tier A — auth-adapter tables** verbatim to the Auth.js Postgres shape: `users` (table `"user"`, **extended** with `handle` unique, `role` enum, `isBot`, `createdAt`), `accounts`, `sessions`, `verificationTokens`, (optional) `authenticators` (data-model Tier A; research B1).
- [ ] T008 Add `db/schema.ts` **pgEnums**: `role`, `matchMode`, `winnerSide`, `adaptation`, `postType`, `postStatus` (data-model Conventions).
- [ ] T009 Implement `db/schema.ts` **`squads`**: columns + `config` `jsonb.$type<SquadConfig>()`, `defenseSlot`, `powerRating`, `schemaVersion`; unique `(userId, slotIndex)`, **partial unique `(userId, defenseSlot) WHERE defenseSlot IS NOT NULL`**, `(userId)` index, `defenseSlot ∈ {NULL,0..2}` check (data-model).
- [ ] T010 [P] Implement `db/schema.ts` **`defense_snapshots`**: frozen `config` jsonb, `sourceSquadId` (set null), `active`, `defenseSlot`, `createdAt`/`deactivatedAt`; **partial unique `(userId, defenseSlot) WHERE active`** (⇒ ≤3 active — the DB invariant), partial serve index `(userId) WHERE active`, `defenseSlot ∈ {0..2}` check (data-model, research B3).
- [ ] T011 [P] Implement `db/schema.ts` **`matches`**: participants (nullable/set-null FKs), `mode`, `adaptation`, `winnerSide`, Bo3 scores, per-side damage, `durationTicks`, `seed numeric(20,0)`, `rulesetHash`, `formatVersion`; indexes on attacker/defender/(mode,createdAt)/snapshot (data-model).
- [ ] T012 [P] Implement `db/schema.ts` **`replays`**: `matchId` unique (cascade), `replay jsonb.$type<Replay>()`, scalar provenance (`seed numeric(20,0)`, `rulesetHash`, `formatVersion`, `winnerSide`) per Feature-1 replay-format §Storage (data-model B4).
- [ ] T013 [P] Implement `db/schema.ts` **`ladder_standings`**: counters + `netVictories` (generated `attackWins − defenseLosses`), career fields, `netVictories` index for the leaderboard (data-model B5, §13).
- [ ] T014 [P] Implement `db/schema.ts` **`posts`** (slug unique, type/status enums, nullable `authorId`, `metadata` jsonb, published index) and **`presets`** (per-machine-type `config` jsonb) (data-model).
- [ ] T015 Define Drizzle **relations** (users↔squads/defense/matches/standings/presets/posts; squads↔snapshots; matches↔replays) in `db/schema.ts` for typed joins.
- [ ] T016 Generate the migration: `npm run db:generate`; review the SQL (partial-unique `WHERE` clauses, generated column, checks present); apply to the **Neon dev branch** (`db:migrate`). **Assert it applies cleanly on an empty DB** (SC-008).
- [ ] T017 Implement `src/server/authz.ts`: `requireSession()`, `requireOwner(resource, session)`, `requireAdmin(session)` — the Trust-boundary rules A1–A3 read from the server session/DB only (Principle II, P6).

**Checkpoint**: schema migrated on the dev branch; jsonb types + authz guards exist; stories can begin.

---

## Phase 3: User Story 1 — Sign in with Google + server-side admin role (P1) 🎯 MVP

**Goal**: Google OAuth sign-in creates/matches a user, establishes a **database session**, and
seeds/enforces an **admin role** server-side.

**Independent Test**: OAuth round-trip → one `users` + one `accounts` row; repeat → no duplicate;
allowlisted email → `role='admin'`; forged client admin flag → denied; role revoked → denied next
request without re-login.

### Tests for User Story 1 ⚠️ (write first)

- [ ] T018 [P] [US1] `tests/auth.session.test.ts`: first sign-in creates exactly one `users`+`accounts` row; repeat sign-in matches the existing user (SC-001) — via the adapter against the dev branch.
- [ ] T019 [P] [US1] `tests/authz.test.ts`: a forged `admin` flag in client state is ignored (role read server-side); a normal session fails `requireAdmin`; an allowlisted user passes (SC-002, US1-AS3/4).
- [ ] T020 [P] [US1] `tests/authz.test.ts`: revoking `users.role` from `admin`→`player` denies admin on the **next request with no re-login** (database-session server-authority, SC-002, US1-AS5).

### Implementation for User Story 1

- [ ] T021 [US1] Implement `auth.ts`: `NextAuth(() => ({ … }))` **lazy init** (defers `getDb()`; build-safe), `DrizzleAdapter(getDb(), { usersTable, accountsTable, sessionsTable, verificationTokensTable })` — **no Proxy** — `session.strategy='database'`, Google provider (contract auth.md; research A2/A3/A4).
- [ ] T022 [US1] Add the `session` callback (attach `user.id` + `user.role`) and a `signIn`/`events` hook seeding `role='admin'` from `ADMIN_ALLOWLIST` server-side (research A5). Extend the `Session`/`User` TS types (`role`, `id`).
- [ ] T023 [US1] Create `app/api/auth/[...nextauth]/route.ts` (`export const { GET, POST } = handlers; export const runtime = 'nodejs'`) and (optional) `proxy.ts` Node-runtime route guards via `auth()` (contract auth.md).
- [ ] T024 [US1] Playwright e2e `tests/e2e/signin.spec.ts`: complete a Google sign-in against the test instance, assert a session cookie + a signed-in server state; assert a cancelled round-trip creates no user (spec edge case).

**Checkpoint**: users can sign in with Google; identity + admin role are server-authoritative.

---

## Phase 4: User Story 2 — Save & load a roster of squads (P1)

**Goal**: signed-in roster CRUD (≤8 baseline), squad stored as validated Feature-1 jsonb config,
ownership enforced.

**Independent Test**: save a valid squad → round-trips; illegal squad → rejected with reason, no
row; 9th squad → cap error; cross-user access → denied.

### Tests for User Story 2 ⚠️ (write first)

- [ ] T025 [P] [US2] `tests/squads.test.ts`: `saveSquad` round-trips a valid `SquadConfig` (byte-equal read-back), derives `powerRating`, bumps `updatedAt` on update (US2-AS1/2).
- [ ] T026 [P] [US2] `tests/squads.test.ts`: every enumerated illegal army (size≠5, zone-cap, mount-illegal, dup utility, excess Plan-B) is rejected by the shared `validate()` **before insert** and writes no row (SC-003, US2-AS3).
- [ ] T027 [P] [US2] `tests/squads.test.ts`: 8-slot cap rejects the 9th save; and user B is denied read/edit/delete of user A's squad (US2-AS4/5, authz A2).

### Implementation for User Story 2

- [ ] T028 [US2] Implement `src/server/squads.ts`: `saveSquad`/`updateSquad`/`loadSquad`/`listSquads`/`deleteSquad`/`listAttackable` (contract persistence-api.md). Each calls `requireSession`+`requireOwner`; write paths call the shared Feature-1 `validate()` and derive `powerRating` before insert; enforce `slotIndex < 8`.
- [ ] T029 [US2] Wire the shared `validate()` import from the Feature-1 TS surface (or the wasm `validate` export) so the DB rejects exactly the builds the engine would (P8); return the validator's reason as a typed error.

**Checkpoint**: rosters persist and load; no illegal army reaches the DB.

---

## Phase 5: User Story 3 — Designate defense with immutable snapshots (P1)

**Goal**: designate ≤3 squads as defense with **copy-on-designate immutable snapshots**, attack/
defense **pool exclusivity**, and the ≤3 cap as a **DB invariant**.

**Independent Test**: designate → immutable snapshot + squad leaves attack pool; edit source → snapshot
unchanged; re-designate → new snapshot, old deactivated; 4th → rejected by constraint; undesignate → back
in pool.

### Tests for User Story 3 ⚠️ (write first)

- [ ] T030 [P] [US3] `tests/defense.immutability.test.ts`: after `designateDefense`, editing the source squad N× leaves the snapshot `config` **unchanged**; `redesignateDefense` inserts a **new** snapshot and never mutates the prior row (SC-004, US3-AS2/3).
- [ ] T031 [P] [US3] `tests/defense.pool.test.ts`: a designated squad is absent from `listAttackable`; a user with all squads designated has an **empty** attack pool (US3-AS5, SC-005).
- [ ] T032 [P] [US3] `tests/defense.cap.test.ts`: a 4th concurrent designation is rejected by the **partial-unique DB constraint** (not just app code); slots stay distinct under a race (SC-005, US3-AS4).
- [ ] T033 [P] [US3] `tests/defense.retain.test.ts`: undesignating/deleting a source squad **retains** a snapshot referenced by a match (soft-deactivate, FR-014, US3-AS6).

### Implementation for User Story 3

- [ ] T034 [US3] Implement `src/server/defense.ts` `designateDefense` as a **postgres-js transaction**: ownership check → deactivate the current active snapshot at the slot → insert a frozen `config` copy (`active=true`) → set `squads.defenseSlot` (data-model Snapshot mechanism; research B3).
- [ ] T035 [US3] Implement `undesignateDefense` (squad→attack pool; snapshot soft-deactivate, retain if referenced), `redesignateDefense` (new snapshot at current slot), and `listDefense` (active ≤3). All transactional; rely on the partial-unique indexes as the final race guard.

**Checkpoint**: defense snapshots are immutable, pools are exclusive, and the ≤3 cap is a DB invariant.

---

## Phase 6: User Story 4 — Persist battle results & replays (P2)

**Goal**: server-only recording of a resolved Bo3 — a `matches` summary + a `jsonb` `replays` row
with scalar provenance — honoring the Feature-1 replay-format contract.

**Independent Test**: record a fixture match → summary + replay linked 1:1; jsonb parses to a valid
`Replay`; scalar columns equal the replay `meta`; summaries query without parsing the blob;
practice match changes no standing and hides the opponent.

### Tests for User Story 4 ⚠️ (write first)

- [ ] T036 [P] [US4] `tests/matches.test.ts`: `recordMatch` writes a `matches`+`replays` pair (1:1) with matching provenance (seed/rulesetHash/formatVersion/winner); the stored jsonb deserializes to a valid `Replay` and `snapshots[tick]` indexes O(1) (SC-006, US4-AS1/2).
- [ ] T037 [P] [US4] `tests/matches.test.ts`: `listMatches`/`getMatch` filter by user/mode/winner using **scalar columns only** (no blob parse); a too-old `formatVersion` triggers the regenerate path, not a failure (US4-AS3/4, FR-018).
- [ ] T038 [P] [US4] `tests/matches.test.ts`: a `practice` match records with the opponent flagged hidden and changes **no** standing (US4-AS5, FR-019); an attempt to write a result from a non-server caller is rejected (A5, P6).

### Implementation for User Story 4

- [ ] T039 [US4] Implement `src/server/matches.ts` `recordMatch` (server-only) as a transaction: insert `matches` (extract provenance to scalar columns) + `replays` (jsonb), and — for `ranked` — update `ladder_standings` (US5 hook). Reject client-originated calls (A5).
- [ ] T040 [US4] Implement `getMatch`/`listMatches` (scalar-only reads) and `getReplay` (jsonb→typed `Replay`; gate on supported `formatVersion`; regenerate from persisted seed+armies+rulesetHash when unsupported — server re-emission, FR-018).
- [ ] T041 [P] [US4] Add `isBot`/seeded-defender support: a helper to record matches against `isBot` defender snapshots so cold-start armies (P5) participate uniformly (FR-015).

**Checkpoint**: every resolved match is stored from day one; replays are faithful and queryable.

---

## Phase 7: User Story 5 — Net-victory ladder standing (P2)

**Goal**: maintain each user's net-victory standing (attack wins − defense losses) transactionally
on ranked results; reconcilable from `matches`; leaderboard read.

**Independent Test**: record ranked wins/losses → standings update correctly; recompute from
`matches` equals the cache; practice moves nothing; leaderboard orders by net victories.

### Tests for User Story 5 ⚠️ (write first)

- [ ] T042 [P] [US5] `tests/standings.test.ts`: a ranked attacker win increments attacker `attackWins`/`netVictories` and increments defender `defenseLosses`/decrements their `netVictories` (§13, US5-AS1).
- [ ] T043 [P] [US5] `tests/standings.test.ts`: `recomputeStanding` re-aggregated from `matches` **equals** the cached standing for a recorded history (SC-007, US5-AS2); practice matches change nothing (US5-AS3).
- [ ] T044 [P] [US5] `tests/standings.test.ts`: `getLeaderboard` returns users ordered by `netVictories` DESC (US5-AS4).

### Implementation for User Story 5

- [ ] T045 [US5] Implement `src/server/standings.ts`: the standing update (called inside `recordMatch`'s tx for `ranked`), `getStanding`, `getLeaderboard` (indexed order), and `recomputeStanding` (the reconciliation oracle). Ensure a `ladder_standings` row is upserted on first ranked result.

**Checkpoint**: standings track net victories and reconcile with the source of truth.

---

## Phase 8: Shared persistence — News posts & Presets

**Purpose**: the unified `posts` table (owned here; written by F11/F12) and the custom `presets`
library (for F4). Independently useful; not gated by US1–US5 beyond auth.

- [ ] T046 [P] `tests/posts.test.ts`: `createPost` supports editorial (authored) and auto (nullable author) posts; `publishPost` sets status/publishedAt; `listPublished` returns published posts ordered by `publishedAt` DESC; `getPostBySlug` reads an article (FR-024/025).
- [ ] T047 Implement `src/server/posts.ts` (`createPost`/`publishPost`/`listPublished`/`getPostBySlug`) — `listPublished`/`getPostBySlug` are the only public (no-session) reads; authoring/publishing gated per author/admin (contract persistence-api.md).
- [ ] T048 [P] `tests/presets.test.ts` + `src/server/presets.ts` (`savePreset`/`listPresets`/`deletePreset`) — per-machine-type `config` jsonb, ownership enforced (provided for Feature 4).

**Checkpoint**: the news substrate and custom-preset library exist for F11/F12/F4.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T049 [P] Seed **cold-start defender armies** (P5): create `isBot` users owning `defense_snapshots` from a fixture set so the ladder is never empty at launch (design §16.1); a `db/seed.ts` runnable against the dev branch.
- [ ] T050 [P] Run the full validation suite (SC-001…SC-008) green on the **Neon dev branch**; document the promote-to-prod step (apply the reviewed migration to the primary branch) in a short `db/README.md`.
- [ ] T051 [P] Apply the reviewed migration to the **production** Neon branch (via Vercel env `DATABASE_URL`); verify the app boots and a Google sign-in works in prod.
- [ ] T052 Update repo docs: `CHANGELOG.md` (auth + persistence schema), and note for the orchestrator that `STATUS.md`'s driver line (`neon-http`→`postgres-js`) and Feature-7 status need updating (do not edit STATUS.md here).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → depends on Setup; **blocks all user stories** (the schema + authz).
- **US1 (P3)** → depends on Foundational; the MVP (identity).
- **US2 (P4)** → depends on Foundational + US1 (needs a session/owner).
- **US3 (P5)** → depends on **US2** (designates saved squads).
- **US4 (P6)** → depends on Foundational + US1/US3 (references participants + snapshots).
- **US5 (P7)** → depends on **US4** (updates inside `recordMatch`).
- **Shared (P8)** → depends on Foundational + US1 (auth for authoring).
- **Polish (P9)** → depends on all desired stories.

### Within a story

Tests (trust-boundary / immutability) first → schema/guards → service functions → e2e/wiring. Commit
after each task or logical group (Principle IX).

### Parallel opportunities

- Setup: T003–T005 in parallel.
- Foundational: T010–T014 (distinct tables) in parallel after T007–T009; T017 alongside.
- US1 tests T018–T020 in parallel; US2 T025–T027; US3 T030–T033; US4 T036–T038; US5 T042–T044.
- Shared (T046–T048) parallel to Polish prep.

---

## Implementation Strategy

### MVP first (US1 + US2 + US3)

Setup → Foundational → **US1 (auth)** → **US2 (roster)** → **US3 (defense snapshots)**. That trio is
the async-PvP **data + auth** foundation Feature 8 needs — a signed-in player saves squads and
designates an immutable, pool-exclusive defense.

### Incremental delivery

US1 (identity) → US2 (roster) → US3 (defense snapshots) → US4 (results/replays) → US5 (standings) →
Shared (posts/presets). Each adds provable value; the feature is "done" when SC-001…SC-008 are green
on the Neon dev branch and the reviewed migration is applied to prod.

---

## Notes

- Build on the **existing** `db/index.ts` (postgres-js, lazy `getDb()`, **no Proxy**) — the auth
  adapter depends on all three; do not regress them.
- The **partial-unique indexes** (defense slots) are the real ≤3-cap / exclusivity guard — never
  weaken them to an app-only check.
- Squad/replay/preset jsonb bind to **Feature-1 types** (P8); the DB never re-declares the sim's
  content schema. Validate every squad write with the **shared** `validate()`.
- All DDL is tested on a **Neon dev branch** before prod (research C1); production `DATABASE_URL`
  comes from the Vercel/Neon env, not `.env.local`.
