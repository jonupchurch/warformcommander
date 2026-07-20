---
description: "Task list for Feature 8 — Arena (async matchmaking) + Practice sandbox"
---

# Tasks: Arena (async matchmaking) + Practice sandbox

**Input**: Design documents from `specs/008-arena-practice/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [contracts/matchmaking-resolve-api.md](./contracts/matchmaking-resolve-api.md)

**Tests**: **INCLUDED and non-optional.** This feature's entire value is **P6 (NON-NEGOTIABLE,
server-authoritative)** — a ranked result the client can never fabricate. Its Success Criteria
(SC-001…SC-009) are executable, and the anti-forgery, locked-snapshot, and practice-no-standing
tests are **security-critical** — written **before** the code they guard (constitution Principle
VIII + P6).

**Depends on**: **Feature 1** (engine — `resolveBattle()` in `src/sim/`, imported in-process, never
modified), **Feature 7** (persistence — `listAttackable`, `recordMatch`, the `defense_snapshots`/
`squads`/`matches`/`ladder_standings` schema, the `tests/db-setup.ts` dev-branch harness), and
**Feature 3** (app shell + the stubbed `app/(app)/{arena,practice}/page.tsx` placeholders). All
three must be built first.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 (maps to spec.md); Setup/Foundational/Polish carry no story label
- Paths are exact and match [plan.md](./plan.md) Project Structure. Orchestration under
  `src/server/` (mirrors Feature 7's layout, flat — no subfolder); screens under
  `app/(app)/{arena,practice}/`; resolve entrypoints under `app/api/{arena,practice}/resolve/`;
  tests in `tests/*.test.ts` (**reusing Feature-7's `tests/db-setup.ts` harness**); e2e in `e2e/`.
  **Feature 8 owns no schema and calls `recordMatch` from exactly one place per orchestrator** — no
  task here re-implements the engine (F1) or persistence internals (F7).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm prerequisites, wire the WASM tracing keys, and stand up the test harnesses.

- [ ] T001 Confirm prerequisites are in place: Feature 1's `src/sim/` `resolveBattle()` host +
  `@wfc/engine-wasm`; Feature 7's `src/server/{matches.ts,squads.ts,defense.ts}` service API, the
  `defense_snapshots`/`squads`/`matches`/`ladder_standings` schema, and the `tests/db-setup.ts`
  dev-branch/transaction helper; Feature 3's `app/(app)/layout.tsx` shell and the stubbed
  `app/(app)/arena/page.tsx` + `app/(app)/practice/page.tsx` placeholders to be replaced. Note any
  gaps for the orchestrator rather than rebuilding them here.
- [ ] T002 [P] Edit `next.config.ts`: extend `outputFileTracingIncludes` with
  `'/api/arena/resolve'` and `'/api/practice/resolve'` → `['./node_modules/@wfc/engine-wasm/**/*.wasm']`,
  alongside Feature-1's existing `'/api/resolve'` entry (research B2); confirm
  `serverExternalPackages: ['@wfc/engine-wasm']` is already inherited.
- [ ] T003 [P] Create the empty target directories/files this feature lands in:
  `app/api/arena/resolve/`, `app/api/practice/resolve/`, and confirm `src/server/` (Feature 7's
  folder) is where the six new Feature-8 modules land — no new top-level folder needed.
- [ ] T004 [P] Confirm the Vitest runner + Neon dev-branch test DB (Feature-7 T005) is available;
  add a Feature-8-scoped fixture seeder `tests/fixtures/arena.ts` — one real attacker, N other
  users (a mix of real + `isBot`) each holding 1–3 active `defense_snapshots`, and assorted
  `squads` rows across users for the practice draw — for the matchmaking/resolve/practice tests.
- [ ] T005 [P] Confirm Playwright + the viewport-matrix helper (Feature-3 T006) and `e2e/` are
  available for `e2e/arena.spec.ts` + `e2e/practice.spec.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The transient DTOs, the seed generator, and the ruleset seam every story (ranked
**and** practice) imports. Nothing in Phase 3+ can begin until this is done.

**⚠️ CRITICAL**: This is the shared shape ([contracts/matchmaking-resolve-api.md](./contracts/matchmaking-resolve-api.md))
every orchestration function below composes.

- [ ] T006 Implement `src/server/arena-types.ts`: `RankedMatchRequest { attackSquadId,
  ticketSnapshotId }`, `PracticeMatchRequest { opponentSquadId }`, `MatchmakingSelection {
  defenderUserId, defenderSnapshotId, poolSource, servedConfig }`, `MatchTicket { defenderSnapshotId,
  preview }`, `PracticeDraw { opponentSquadId, opponentConfig }` (contract §1–§2). No
  user id/opponent/seed/outcome field exists on any client-facing type (P6) — this is the trust
  boundary made structural, not just enforced by convention.
- [ ] T007 [P] Implement `src/server/seed.ts`: `serverSeed(): bigint` — a cryptographically-strong
  `u64` (`crypto.randomBytes`/`getRandomValues`), marshaled to match Feature-7's `numeric(20,0)`
  seed columns (research B3, contract §7). Accepts no arguments — there is nothing for a client
  value to override.
- [ ] T008 [P] Implement `src/server/ruleset.ts`: `loadCurrentRuleset(): { ruleset, rulesetHash }`
  — v1 returns a committed default `Ruleset` (the Feature-1 seed ruleset) + its hash (research D1,
  contract §6). Document inline that Feature 12 (or an added Feature-7 `rulesets` table) replaces
  the body only — the resolve path never changes (plan.md Cross-feature coordination notes).
- [ ] T009 Smoke-test the in-process engine import: a throwaway script/test calling
  `resolveBattle()` from `src/sim/` against a fixture `BattleInput` from within a `src/server/`
  module, confirming no self-HTTP hop and no second WASM binding (research B1).

**Checkpoint**: DTOs + seed + ruleset seam + in-process engine import exist; ranked and practice
orchestration can begin.

---

## Phase 3: User Story 1 — Attack: pick a squad, get matched, the server resolves and records the Bo3 (P1) 🎯 MVP

**Goal**: the full ranked deploy flow — pick an attackable squad → server selects an opponent →
resolves the Bo3 via the Feature-1 engine → records match+replay+standings via Feature-7
`recordMatch` → returns a match id the client never gets to dispute.

**Independent Test**: with a seeded DB (one real attacker + ≥1 cold-start bot defender), call the
attack orchestration for a chosen attackable squad; assert exactly one `matches` row
(`mode='ranked'`) is written, its winner/games/damage reconcile with the returned replay,
`ladder_standings` moved by the §13 rule, and the returned handle is a match id, not a
client-trusted result object.

### Tests for User Story 1 ⚠️ (write first)

- [ ] T010 [P] [US1] `tests/matchmaking.test.ts`: `pickRankedOpponent(ctx)` against the arena
  fixture returns a defender ≠ the attacker plus one of that defender's active snapshots (basic
  sanity ahead of US2's full property suite).
- [ ] T011 [P] [US1] `tests/arena.test.ts`: `startRankedMatch` writes exactly **one** `matches` row
  (`mode='ranked'`) + one `replays` row whose winner/games/damage reconcile with the returned
  result, and `ladder_standings` moves per §13 (spec US1 Independent Test a–c).
- [ ] T012 [P] [US1] `tests/arena.test.ts`: the value returned from `startRankedMatch` is a
  **match id** (string) — never a mutable result object; the client can only fetch the outcome
  afterward by id (spec US1 Independent Test d, AS3).
- [ ] T013 [P] [US1] `tests/arena.test.ts`: a player with **zero** attackable squads is blocked
  from `startRankedMatch` with a typed `NOT_ATTACKABLE` reason, and no `matches` row is written
  (AS4, FR-001).

### Implementation for User Story 1

- [ ] T014 [US1] Implement `pickRankedOpponent(ctx)` in `src/server/matchmaking.ts`: the two-step
  random select (research C1) — a random eligible defender (≠ attacker, ≥1 active snapshot,
  real+bot pool) → a random active snapshot of that defender — via the shared `db/schema.ts`/
  `getDb()`; returns `MatchmakingSelection`; typed `NO_OPPONENT` if the pool is empty (never
  falls back to self).
- [ ] T015 [US1] Implement `previewRankedMatch` (Server Action) in `src/server/arena.ts`: `ctx =
  resolveSession()` → assert the caller's squad set ∈ `listAttackable(ctx)` is non-empty (F7 A2,
  FR-001) → `pickRankedOpponent(ctx)` → project to the fogged `MatchTicket` (composition/
  placement/power/tags only — full fog contract lands in US3). No write.
- [ ] T016 [US1] Implement `startRankedMatch` orchestrator in `src/server/arena.ts` (research B4
  flow, contract §4): `ctx = resolveSession()` → re-validate the chosen squad is owned + currently
  attackable **at deploy time** (FR-002) → bind the snapshot **by** `input.ticketSnapshotId` → `{
  ruleset, rulesetHash } = loadCurrentRuleset()` → `seed = serverSeed()` → `resolveBattle({
  armies:[attackerCfg, snapshotCfg], ruleset, seed, matchConfig:{ adaptation:"Locked",
  defenderSide:"defender", bestOf:3 } })` (F1, in-process) → `recordMatch({ mode:"ranked", … })`
  (F7, one tx) → return `{ matchId }`. Reads **only** `attackSquadId`/`ticketSnapshotId` from
  `input` — never an opponent/seed/ruleset/outcome (FR-009/010/012).
- [ ] T017 [US1] Implement `app/api/arena/resolve/route.ts` (Node Route Handler, `runtime =
  'nodejs'`): parse the body as `RankedMatchRequest` (destructure exactly `attackSquadId` +
  `ticketSnapshotId`) → call `startRankedMatch(ctx, input)` → return `{ matchId }` (research B2,
  contract §8).
- [ ] T018 [US1] Implement `app/(app)/arena/page.tsx` (Server Component): reads `listAttackable(ctx)`
  + calls `previewRankedMatch` to render the attack-squad picker and the matched enemy board
  (composition/placement/power/tags only); replaces the Feature-3 placeholder.
- [ ] T019 [US1] Implement `app/(app)/arena/deploy-panel.tsx` (`"use client"` leaf): **DEPLOY**
  button → `POST /api/arena/resolve` → on `{ matchId }` navigate to the Battle Summary/Playback
  route by id (F5/F6 handoff, per plan.md coordination notes); renders the blocked/disabled state
  + reason when the attack pool is empty (AS4).

**Checkpoint**: a player can deploy a ranked attack; the server resolves and records it and returns
a match id — the MVP.

---

## Phase 4: User Story 2 — Random matchmaking: anyone vs anyone, never self, never empty (P1)

**Goal**: harden `pickRankedOpponent` to the full random-matchmaking guarantee (never self, never
empty, per-player fairness) and wire the skip/re-roll affordance.

**Independent Test**: seed the DB with the attacker plus N other users (some `isBot`) each holding
1–3 active snapshots; run selection K times; assert the attacker is never selected, every selection
returns an eligible non-self defender + exactly one of that defender's active snapshots, and with
only bots present the selection still succeeds (never empty).

### Tests for User Story 2 ⚠️ (write first)

- [ ] T020 [P] [US2] `tests/matchmaking.test.ts`: run `pickRankedOpponent(ctx)` **K times** (e.g.
  200) over the fixture pool; assert **0** self-matches and **100%** return an eligible non-self
  defender + exactly one active snapshot (SC-004, spec US2 Independent Test).
- [ ] T021 [P] [US2] `tests/matchmaking.test.ts`: with the attacker as the only real account and
  **only** `isBot` users holding snapshots, `pickRankedOpponent` still returns a bot defender every
  time — never `NO_OPPONENT`, never self (AS2, P5).
- [ ] T022 [P] [US2] `tests/matchmaking.test.ts`: over many draws, each eligible **defender user**
  is selected with roughly-equal frequency (the two-step per-player-fair draw, research C1) — not
  weighted by how many active snapshots that user holds.
- [ ] T023 [P] [US2] `tests/arena.test.ts`: `previewRankedMatch`, re-invoked (skip/re-roll), returns
  a **fresh** `MatchTicket` and records **no** `matches` row and changes **no** `ladder_standings`
  value (AS3, FR-006).

### Implementation for User Story 2

- [ ] T024 [US2] Harden `pickRankedOpponent` in `src/server/matchmaking.ts` to the exact two-step
  SQL shape from research C1 (`EXISTS`-filtered `ORDER BY random() LIMIT 1` for the defender, then
  a second `ORDER BY random() LIMIT 1` over that defender's active snapshots) if T014's version was
  a simpler placeholder; confirm self-exclusion (`u.id <> :attacker`) and the combined real+bot
  pool are both structural, not incidental.
- [ ] T025 [US2] Extend `app/(app)/arena/deploy-panel.tsx` with the **↻ SKIP OPPONENT** control
  (per the [Arena mockup](../../reference/Warform%20Commander%20Arena.dc.html)) that re-invokes
  `previewRankedMatch` for a fresh `MatchTicket` without navigating away or recording anything.
- [ ] T026 [P] [US2] Surface the typed `NO_OPPONENT` error path to the Arena screen (edge case —
  no eligible real defender and no bots; should not occur once Feature-7 cold-start seeding
  exists, but the UI must render it rather than silently falling back to self-match).

**Checkpoint**: matchmaking is provably random, never-self, never-empty; the player can re-roll
freely before committing.

---

## Phase 5: User Story 3 — Defense is served blind and locked for the Bo3 (P2)

**Goal**: the served snapshot's behavior configuration never leaves the server pre-battle, and the
**same** immutable snapshot is used as the defender for **all three** Bo3 games — bound by id even
if the defender re-designates in the preview→deploy window.

**Independent Test**: resolve a ranked match against a defender with 3 active snapshots; assert (a)
the served `defenderSnapshotId` is one of the three, (b) all three game replays use the identical
defender army (byte-equal), and (c) the pre-battle preview payload contains no behavior-dial /
Plan-B fields of the served snapshot.

### Tests for User Story 3 ⚠️ (write first)

- [ ] T027 [P] [US3] `tests/arena.test.ts`: resolving against a defender with 3 active snapshots
  serves exactly one `defenderSnapshotId` (one of the three) and the attacker has no input
  selecting it (SC-006, AS1).
- [ ] T028 [P] [US3] `tests/arena.test.ts`: all three Bo3 game replays use the **byte-identical**
  defender army (`adaptation='Locked'`), and the recorded match references exactly **one**
  `defenderSnapshotId` (SC-002, AS2).
- [ ] T029 [P] [US3] `tests/arena.test.ts`: the pre-battle preview payload (`MatchTicket`) contains
  **no** behavior-dial / Plan-B fields of the served snapshot — only composition/placement/power/
  derived tags (SC-006, AS3).
- [ ] T030 [P] [US3] `tests/arena.test.ts`: if the defender **re-designates** (a new snapshot)
  after the attacker was matched, the match still resolves against the **exact snapshot id** that
  was served, not the new one (immutability edge case, AS4).

### Implementation for User Story 3

- [ ] T031 [US3] Implement the preview→board projection in `src/server/arena.ts` /
  `arena-types.ts`: a strict allow-list mapper from a served snapshot's `config` to the
  client-visible `MatchTicket.preview` shape (composition, placement, power, derived
  damage-family tags) that structurally excludes `BehaviorDials`/`PlanBTrigger` fields (FR-007,
  contract §2).
- [ ] T032 [US3] Confirm `startRankedMatch` (T016) binds the served snapshot **by id** and resolves
  against Feature-7's immutable frozen row regardless of its current `active` flag at deploy time
  (FR-008) — this relies on Feature-7 retention (FR-014), so the task here is to **exercise and
  assert** it, not build a new mechanism.
- [ ] T033 [US3] Confirm the single `resolveBattle()` call's `matchConfig` always sets
  `adaptation:"Locked"` for ranked (T016), so one call resolves all three games against the one
  served army (F1 SC-007) — verify there is no per-game re-resolve loop anywhere in `arena.ts`.

**Checkpoint**: the blind + locked guarantee is proven by tests, not just inherited by assumption.

---

## Phase 6: User Story 4 — Practice: face a random hidden squad, refreshable, no stakes (P2)

**Goal**: Practice mode — a random hidden DB squad opponent, refreshable before deploy, resolves
with `adaptation=Free`, records `mode='practice'`, and changes no standing.

**Independent Test**: run a practice match against a random DB squad; assert `matches.mode='practice'`,
`ladder_standings` is unchanged (0 delta), the opponent's identity is absent from every practice
response, and refreshing before deploy re-draws a different random squad with no side effects.

### Tests for User Story 4 ⚠️ (write first)

- [ ] T034 [P] [US4] `tests/practice.test.ts`: `startPracticeMatch` records `matches.mode='practice'`,
  leaves `ladder_standings` unchanged (0 delta, cross-checked against Feature-7's
  `recomputeStanding` oracle), and the opponent's identity is absent from every practice response
  (SC-003, AS1/AS2).
- [ ] T035 [P] [US4] `tests/practice.test.ts`: `refreshPracticeOpponent` draws a **different**
  random hidden squad with **no** `matches` row written and no side effects (AS3, FR-015).
- [ ] T036 [P] [US4] `tests/practice.test.ts`: `drawPracticeOpponent(ctx, exclude)` never returns
  one of the calling player's own squads (self-exclusion, spec Assumptions).

### Implementation for User Story 4

- [ ] T037 [US4] Implement `drawPracticeOpponent(ctx, exclude?)` in `src/server/matchmaking.ts`: a
  random squad from `squads` (owner ≠ `ctx.userId`, id ∉ `exclude`) → `PracticeDraw {
  opponentSquadId, opponentConfig }` with identity stripped (research C1 practice-draw shape,
  contract §3).
- [ ] T038 [US4] Implement `refreshPracticeOpponent` (Server Action) + `startPracticeMatch` in
  `src/server/practice.ts`: `startPracticeMatch` mirrors `startRankedMatch`'s flow (T016) but the
  opponent is a `squads` config (not a snapshot), `matchConfig.adaptation = "Free"`, and it calls
  `recordMatch({ mode:"practice", … })`, which writes **no** `ladder_standings` delta (F7 FR-019).
- [ ] T039 [US4] Implement `app/api/practice/resolve/route.ts` (Node Route Handler): parses
  `PracticeMatchRequest` (`opponentSquadId` only) → calls `startPracticeMatch` → returns `{
  matchId }`.
- [ ] T040 [US4] Implement `app/(app)/practice/page.tsx` (Server Component) + `app/(app)/practice/
  practice-panel.tsx` (`"use client"` leaf): draws a hidden opponent on load; **DEPLOY** → `POST
  /api/practice/resolve` → navigate by `matchId`; **REFRESH** → `refreshPracticeOpponent` for a new
  hidden draw; replaces the Feature-3 placeholder.

**Checkpoint**: practice is a free, no-stakes on-ramp that reuses the ranked resolve path with two
flags flipped.

---

## Phase 7: User Story 5 — Server authority: a client cannot fabricate a result (P2)

**Goal**: prove — adversarially — that a client cannot influence or fabricate the opponent, the
seed, the ruleset, or the outcome of a ranked match, and that every recorded match is reproducible.

**Independent Test**: submit a deploy request augmented with forged `result`/`winner`/`seed`/
`opponentId` fields; assert the server ignores them, resolves independently, and the recorded match
matches the server's own computation (not the forged values). Assert `recordMatch` has no
client-reachable surface.

### Tests for User Story 5 ⚠️ (write first)

- [ ] T041 [P] [US5] `tests/arena.test.ts` (anti-forgery): `POST /api/arena/resolve` with a JSON
  body augmented with forged `result`/`winner`/`seed`/`opponentId` fields; assert the server
  ignores them, resolves independently, and the recorded match equals the server's own
  computation — not the forged values (SC-001, AS1/AS2).
- [ ] T042 [P] [US5] `tests/arena.test.ts`: assert `recordMatch` is reachable from **no**
  client-facing route handler or Server Action other than from **inside**
  `startRankedMatch`/`startPracticeMatch`, immediately after a server-computed `resolveBattle()`
  result — a static import/call-graph assertion, not just a runtime behavior check (F7 A5).
- [ ] T043 [P] [US5] `tests/arena.test.ts` (reproducibility): given the persisted `seed` + armies +
  `rulesetHash` of a recorded ranked match, re-running Feature-1 `resolve()` reproduces the
  **byte-identical** replay (SC-007, AS3).

### Implementation for User Story 5

- [ ] T044 [US5] Harden `app/api/arena/resolve/route.ts`'s input parsing (T017) to a **strict**
  schema that only reads `{ attackSquadId, ticketSnapshotId }` from the request body — any other
  field is structurally unreadable, never merely "ignored by convention" (FR-009/010, Principle
  II).
- [ ] T045 [US5] Apply the same strict-schema hardening to `app/api/practice/resolve/route.ts`'s
  input parsing (only `opponentSquadId` — no opponent/seed override surface exists).
- [ ] T046 [US5] Document the P6 boundary inline in `arena.ts`/`practice.ts`: `recordMatch` is
  called exactly once per orchestrator, immediately after the local `resolveBattle()` result,
  never exported from a client-reachable function (supports T042's static check; SC-001 "verified
  by static review").

**Checkpoint**: P6 is not just designed-in — it is adversarially tested and passes.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T047 [P] Run the full SC-001…SC-009 suite green (Vitest + Playwright) on the Neon dev branch;
  confirm `next build`, `tsc --noEmit`, and ESLint pass.
- [ ] T048 [P] `e2e/arena.spec.ts` (Playwright): the Arena deploy → Battle Summary/Playback
  handoff completes end-to-end, using the Feature-3 viewport-matrix helper (plan.md Testing).
- [ ] T049 [P] `e2e/practice.spec.ts` (Playwright): Practice draw → refresh → deploy → replay
  handoff completes end-to-end.
- [ ] T050 [P] Verify SC-008 (budget): a ranked Bo3 resolves **and** records well under Vercel's
  Fluid Compute default duration — a timed assertion in `tests/arena.test.ts` or a dedicated perf
  smoke test.
- [ ] T051 Update repo docs: `CHANGELOG.md` (Arena ranked flow + Practice sandbox) and note for the
  orchestrator to flip Feature 8 → built in `STATUS.md` and flag the still-open Feature 12/Feature
  7 live-ruleset-store coordination item (plan.md Cross-feature coordination notes); queue a
  devlog news note per the repo's "code push → news" convention (once the News system ships).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → depends on Feature 1 + Feature 7 + Feature 3 being built.
- **Foundational (P2)** → depends on Setup; **blocks all user stories** (DTOs + seed + ruleset seam).
- **US1 (P3)** → depends on Foundational; the MVP (deploy → resolve → record → match id).
- **US2 (P4)** → depends on **US1** (hardens the `pickRankedOpponent` T014 built for US1, and
  extends the deploy-panel it created) — largely different assertions on the same function; the
  skip-button task is a different file section (`deploy-panel.tsx` addition).
- **US3 (P5)** → depends on **US1** (asserts properties of the resolve flow US1 built; no new
  orchestration path, mostly the preview-projection allow-list + tests).
- **US4 (P6)** → depends on Foundational + **US1** (mirrors `startRankedMatch`'s shape with two
  flags flipped; reuses `arena-types.ts`/`seed.ts`/`ruleset.ts` from Foundational).
- **US5 (P7)** → depends on **US1** (hardens the exact route/orchestrator US1 built; adversarial,
  not a new user-visible path per spec "Why this priority").
- **Polish (P8)** → depends on all desired stories.

### Within a story

Tests (integration against the dev-branch DB) first → matchmaking/orchestration functions → route
handlers → screens. Commit after each task or logical group (Principle IX).

### Parallel opportunities

- Setup: T002–T005 in parallel.
- Foundational: T007/T008 in parallel (distinct files) after T006; T009 alongside.
- US1 tests T010–T013 in parallel; implementation is mostly sequential (T014→T015→T016→T017 share
  `arena.ts`/`matchmaking.ts`), T018/T019 parallel to each other once T017 exists.
- US2 tests T020–T023 all `[P]`; T024 sequential (extends T014's file), T025/T026 parallel.
- US3 tests T027–T030 all `[P]`; T031–T033 mostly verification/hardening of existing US1 code, can
  run in parallel (different concerns, same files — coordinate).
- US4 tests T034–T036 all `[P]`; T037 (matchmaking.ts) parallel to T038 (practice.ts) is NOT safe
  (T038 calls T037) — sequential; T039/T040 parallel once T038 exists.
- US5 tests T041–T043 all `[P]`; T044/T045 parallel (different route files), T046 alongside.

---

## Implementation Strategy

### MVP first (US1)

1. Setup → 2. Foundational → 3. **US1** → **STOP & VALIDATE**: a seeded attacker can deploy against
a cold-start bot defender, the server resolves and records the Bo3, standings move, and the client
only ever receives a match id (SC-001 subset, SC-005, SC-009). That alone is a complete,
demonstrable, server-authoritative ranked attack loop.

### Incremental delivery

US1 (deploy → resolve → record) → US2 (matchmaking hardened: never-self/never-empty/fair + skip) →
US3 (blind + locked proven) → US4 (practice sandbox) → US5 (adversarial anti-forgery +
reproducibility). Each adds provable value without breaking prior stories; the whole feature is
"done" when SC-001…SC-009 are green.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- **P6 is the spine**: every task that touches `arena.ts`/`practice.ts`/the two route handlers must
  preserve "the client supplies only which of its own squads attacks" — never add a second
  opponent/seed/ruleset/result input surface to make a test pass.
- **Feature 8 is the orchestration boundary (FR-016)** — no task here reimplements the engine (F1),
  persistence internals (F7), or the Garage/Ladder/Playback/Summary screens (F4/F9/F5/F6); every
  task composes an existing service call and hands off by match id.
- The **live ruleset store** (`loadCurrentRuleset()`'s real backing store) is explicitly **not**
  this feature's job past the v1 default — Feature 12 (or an added Feature-7 `rulesets` table) owns
  it; T051 just flags the open item, it does not resolve it.
- Matchmaking's `ORDER BY random()` queries (T014/T024/T037) read the **shared** Feature-7 schema
  directly via `db/schema.ts`/`getDb()` — the same "read module against the shared schema" shape
  [Feature 9](../009-ladder/plan.md) already established for the Ladder. This is **not** "raw DB
  access from Feature 8" in the sense plan.md's Storage section rules out — it never writes outside
  `recordMatch`, and it owns no schema of its own.
