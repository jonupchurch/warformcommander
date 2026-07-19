---
description: "Task list for Feature 12 — Admin Console + Balance Publishing"
---

# Tasks: Admin Console + Balance Publishing

**Input**: Design documents from `specs/012-admin-console/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: **INCLUDED and non-optional.** This feature's whole value is a trust boundary (the admin
gate) plus a store correctness property (an edit changes the next match's hash while past replays
stay byte-unchanged) — constitution **Principle II**, **P6**, and **Principle VIII** all require
executable tests for exactly these things (SC-001…SC-008). Authz, concurrency, atomicity, and
idempotency tests are written **before** the code they pin, TDD-style.

**Depends on**: **Feature 7** (schema + `src/server/authz.ts` `requireAdmin` + `posts`), **Feature
1** (the `Ruleset` type + canonical `hashRuleset`), **Feature 8** (the `src/server/ruleset.ts`
v1-default seam this feature replaces), **Feature 3** (shell + primitives), **Feature 2** (the
`BalanceReport` artifact, read-only). All must exist first; T001 confirms rather than rebuilds them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 (maps to spec.md user stories); Setup/Foundational/Polish carry no story label
- Paths are exact and match [plan.md](./plan.md) Project Structure. Server code under
  `src/server/`; components under `src/components/admin/`; routes under `app/admin/` and
  `app/api/admin/devlog/`; tests colocated per the repo's Vitest/Playwright convention (Feature 7/8/9).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm every prerequisite this feature builds on and stand up its folders.

- [ ] T001 Confirm prerequisites are in place: Feature 7's `db/schema.ts` (game tables + `postTypeEnum` incl. `balance`/`devlog`/`changelog`), `src/server/authz.ts` (`requireAdmin`), and `posts`; Feature 1's `Ruleset` TS type and whether a standalone `hashRuleset()` export already exists (`src/sim/`); Feature 8's `src/server/ruleset.ts` v1-default seam and its one call site (`src/server/arena.ts`/`practice.ts`); Feature 3's shell/primitives; Feature 2's committed `BalanceReport` artifact location. Note any gap for the orchestrator rather than rebuilding it here.
- [ ] T002 [P] Add `microdiff` to `package.json` (or confirm a hand-rolled typed-path walk is preferred instead — either satisfies the diff contract, research C2).
- [ ] T003 [P] Create the feature folders: `src/components/admin/`, `app/admin/`, `app/admin/balance/`, `app/api/admin/devlog/`.
- [ ] T004 [P] Add `DEVLOG_WEBHOOK_SECRET` to `.env.example` (server-only; confirm `ADMIN_ALLOWLIST` already documented from Feature 7 — no new admin-grant mechanism).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The live-ruleset store itself — the schema, the hash/validate/diff primitives, and the
bootstrap seed. Nothing in Phase 3+ can begin until this is done.

**⚠️ CRITICAL**: This is the coordination gap the whole feature exists to fill (data-model.md).

- [ ] T005 Extend `db/schema.ts`: add the `rulesets` table (`id`, `data jsonb<Ruleset>`, `rulesetHash`, `editorId` FK→users `set null`, `parentId` self-FK `set null`, `note`, `createdAt`) + indexes `(rulesetHash)` and `(createdAt)` (data-model.md → `rulesets`).
- [ ] T006 Extend `db/schema.ts`: add the `current_ruleset` singleton pointer table (`id text PK default 'current'` + `CHECK id='current'`, `rulesetId` FK→rulesets `restrict`, `version integer default 1`, `updatedAt`) (data-model.md → `current_ruleset`). Depends on T005.
- [ ] T007 Generate the migration (`npm run db:generate`), review the SQL (the singleton `CHECK`, both FKs, both indexes present), and apply to the **Neon dev branch** (`db:migrate`); assert it applies cleanly on top of Feature 7's existing schema.
- [ ] T008 [P] Implement/confirm `hashRuleset(ruleset): string` in `src/sim/ruleset-hash.ts` — Feature-1's canonical serialization + hash (research A3). If Feature 1 does not yet expose it standalone, add it here calling the shared WASM/TS surface; **never** a bespoke hash.
- [ ] T009 [P] Implement `validateRuleset(data): { ok: true } | { ok: false; reason: string }` in `src/server/ruleset-validate.ts` — structural completeness (required groups present, references resolvable) + numeric bounds (`splash ≤ 0.25`, fractions in `[0,1]`, ordered `hitClamp`, positive cadence tiers) (data-model.md → Validation, research D2).
- [ ] T010 [P] Implement `diffRuleset(prev, next): RulesetDiffEntry[]` + `renderDiffSummary(diff)` / `renderDiffOneLiner(diff)` in `src/server/ruleset-diff.ts` (research C2; `RulesetDiffEntry = { path, oldValue, newValue, percentDelta? }`).
- [ ] T011 Write the bootstrap seed: insert the initial `rulesets` row (from Feature-1's first-pass stats fixture, `editorId=null`, `note='bootstrap seed'`) and the `current_ruleset` row pointing at it (`version=1`) (data-model.md → Cold start, FR-009). Run it once against the dev branch; assert `getCurrentRuleset()` is non-empty immediately after.

**Checkpoint**: the store schema + hash/validate/diff primitives + a non-empty current ruleset
exist; user-story work can begin.

---

## Phase 3: User Story 1 — Edit the base stats live; the next battle uses them (P1) 🎯 MVP

**Goal**: an admin edits the ruleset and saves; the current pointer flips, `rulesetHash` recomputes,
the **next** resolved battle uses the new ruleset, and **already-recorded replays stay
byte-unchanged**.

**Independent Test**: seed a ruleset, resolve a fixed battle (fixed armies+seed) → R1/H1, persist
its replay; edit a stat affecting that battle and save → assert a new revision + H2≠H1 is current;
resolve the **same** battle → assert the result/hash differs from R1/H1; re-read the first replay
→ assert byte-identical.

### Tests for User Story 1 ⚠️ (write first)

- [ ] T012 [P] [US1] Integration test (Neon dev branch): the full independent-test flow above — edit → save → `getCurrentRuleset()` returns the new revision → resolving the same fixed battle yields a different result whose stamped `rulesetHash` equals the new revision's hash and differs from the pre-edit run; the pre-edit replay row is **byte-identical** before/after (SC-002, SC-003).
- [ ] T013 [P] [US1] Unit test (`ruleset-validate.test.ts`): each enumerated invalid class (missing required field, dangling equipment reference, `splash > 0.25`, an out-of-`[0,1]` probability) is rejected with a reason **before** any write; `current_ruleset` is unchanged after a rejected save (SC-006, US1-AS4).
- [ ] T014 [P] [US1] Integration test: two `saveRuleset` calls loaded from the same `version` race — exactly one succeeds, the other returns `STALE_EDIT`, and `current_ruleset.version` reflects exactly one successful swap (no lost update) (SC-007).

### Implementation for User Story 1

- [ ] T015 [US1] Implement `getCurrentRuleset()` in `src/server/ruleset.ts` — the authoritative, uncached Postgres read (`current_ruleset ⋈ rulesets`) (data-model.md → Read path, FR-006).
- [ ] T016 [US1] Implement `getRulesetForEdit(ctx)` in `src/server/ruleset.ts` — `requireAdmin(ctx)` then the same join, returning `{ revisionId, data, rulesetHash, version }` for the editor to load (FR-010).
- [ ] T017 [US1] Implement `saveRuleset(ctx, { data, expectedVersion, note? })` in `src/server/ruleset.ts` **without the balance post yet** (added in US3): `requireAdmin` → `validateRuleset` → load current for `version` check → **skip the diff step for now** (added in US3) → `hashRuleset` → transaction: insert `rulesets` row, conditional `UPDATE current_ruleset … WHERE version = expectedVersion` (0 rows ⇒ rollback + `STALE_EDIT`) → commit (data-model.md → Write path steps 1–2, 5–6b; FR-010, FR-011, FR-012).
- [ ] T018 [US1] Implement `app/admin/balance/actions.ts` `saveRulesetAction(input)`: `await auth()` → `requireAdmin` (defense-in-depth, layer 3) → `saveRuleset(ctx, input)` → `revalidateTag('ruleset-current')` on success → return the typed result/error to the client (contracts/admin-api.md).
- [ ] T019 [US1] Implement `app/admin/balance/page.tsx` (Server Component): `requireAdmin` (layer 2, via the layout — see US2 T025) → `getRulesetForEdit()` → render `<RulesetEditor>` with the loaded `data`/`version`/`rulesetHash`.
- [ ] T020 [US1] Implement `src/components/admin/ruleset-editor.tsx` (`"use client"` leaf): the dense stat table for `variants`/`equipment`/`damageMatrix`/`cadenceTicks`/`airMods`/`globals`, local edit state, submits via `saveRulesetAction`, surfaces `VALIDATION_FAILED`/`STALE_EDIT` errors inline, shows the new `rulesetHash` on success; scrolls within its own container in portrait, never the page body (Feature 3 primitives, P7).

**Checkpoint**: an admin edit changes the next match's resolution and hash; past replays are
provably untouched; invalid edits and concurrent-edit races are safely rejected. This alone is a
complete, demonstrable live-ops lever.

---

## Phase 4: User Story 2 — Only server-verified admins can reach and use the console (P1)

**Goal**: every admin route/action is denied server-side to anonymous, non-admin, and
forged-`admin`-flag callers; a role revocation takes effect with no re-login; the webhook rejects a
bad/absent secret.

**Independent Test**: hit every admin route/action as anonymous, a non-admin, and a non-admin with
a forged `admin` client value — assert all denied server-side with no state read/write; as a real
admin — assert allowed; POST the webhook with a bad/absent secret — denied; with the correct secret
— accepted.

### Tests for User Story 2 ⚠️ (write first)

- [ ] T021 [P] [US2] Integration test: the full denial matrix — `GET /admin`, `GET /admin/balance`, `saveRulesetAction`, `getRulesetForEdit` — each called as anonymous, non-admin, and non-admin-with-forged-`admin`-cookie/body/query — asserted denied with **zero** rows read or written; the same calls as a real admin succeed (SC-001, US2-AS1/2/3).
- [ ] T022 [P] [US2] Integration test: an admin's `users.role` is revoked mid-session (DB update, no client action) → their **next** request is denied with no re-login required (reuses Feature 7's server-authoritative session property, US2-AS4).
- [ ] T023 [P] [US2] Integration test: `POST /api/admin/devlog` with a missing/invalid `Authorization` secret → 401, no `posts` row written; with the correct secret → 200 and processing continues (US2-AS5).

### Implementation for User Story 2

- [ ] T024 [US2] Author or extend root `proxy.ts`: redirect unauthenticated/non-admin requests away from `/admin*` (UX-only, Node runtime; coordinate with Feature 7 which marked this file "(optional)") (contracts/admin-authz.md → Layer 1).
- [ ] T025 [US2] Implement `app/admin/layout.tsx`: `await auth()` → `redirect` if no session → `requireAdmin(session)` (the **real** layer-2 check) → render the admin shell around `children` (contracts/admin-authz.md → Layer 2).
- [ ] T026 [US2] Audit pass: confirm every admin Server Action (`saveRulesetAction`, T018) and the webhook route (T031) independently re-check authorization (layer 3 / the secret check) rather than relying on the layout — cross-reference against T021's matrix.

**Checkpoint**: the trust boundary holds independent of any UI — every admin surface denies
server-side, and the webhook's secret gate is proven, before the balance editor even needs to
exist.

---

## Phase 5: User Story 3 — A ruleset edit auto-publishes exactly one balance news post (P2)

**Goal**: every ruleset save that changes ≥1 field creates exactly one published `type='balance'`
post with a legible diff; a no-op save creates none; the whole save is atomic.

**Independent Test**: record the current ruleset; change two stats and save → assert exactly one
new `posts` row (`type='balance'`, `authorId`=the admin, `status='published'`, body naming both
changes, `metadata.diff` = the two changed paths old→new); save a no-op (identical) ruleset →
assert no balance post.

### Tests for User Story 3 ⚠️ (write first)

- [ ] T027 [P] [US3] Integration test: a save changing N fields creates **exactly one** `posts` row (`type='balance'`, `status='published'`, `authorId`=the editing admin) whose `metadata.diff` equals the N changed paths (old→new, matching `diffRuleset`'s output) and whose body names each change (SC-004).
- [ ] T028 [P] [US3] Integration test: a save with a ruleset **identical** to the current one creates **no** new `rulesets` revision and **no** balance post (`current_ruleset.version` unchanged) (US3-AS3, FR-015).
- [ ] T029 [P] [US3] Integration test: forcing the balance-post insert to fail mid-transaction (e.g. a constraint violation injected in a test double) rolls back the **whole** save — no new `rulesets` row, no pointer swap, no post (US3-AS4, FR-013).

### Implementation for User Story 3

- [ ] T030 [US3] Extend `saveRuleset` (`src/server/ruleset.ts`, from T017) to call `diffRuleset(current.data, data)` after validation and **before** opening the transaction; short-circuit to `{ noop: true, ... }` (no revision, no post) when the diff is empty (data-model.md → Write path step 4, FR-015).
- [ ] T031 [US3] Extend `saveRuleset`'s transaction to insert the `posts` row (`type='balance'`, `status='published'`, `authorId=ctx.userId`, `slug`, `title`, `excerpt=renderDiffOneLiner(diff)`, `body=renderDiffSummary(diff)`, `metadata={diff, rulesetId, rulesetHash, parentId}`) atomically alongside the revision insert and the pointer swap (data-model.md → Balance post shape, FR-013/014).
- [ ] T032 [P] [US3] Confirm (integration check, no code change expected) the balance post is visible via Feature 11's `listPublished`/News-index read path — the shared `posts` table needs no special-casing on the read side.

**Checkpoint**: every changing save is auto-published as one legible balance post; no-op saves are
silent; the edit and its post are provably one atomic unit.

---

## Phase 6: User Story 4 — A code push auto-publishes a devlog/changelog post (P2)

**Goal**: a real production deploy of a pushed commit auto-creates one `devlog`/`changelog` post
from commit metadata; a retried delivery is a no-op; a bad secret is rejected.

**Independent Test**: POST the devlog endpoint (valid secret) a commit payload → assert one
`posts` row (`type='devlog'`, `authorId` null, `status='published'`) with the commit metadata; POST
the **same** payload again → assert no duplicate; POST with a bad secret → 401, no row.

### Tests for User Story 4 ⚠️ (write first)

- [ ] T033 [P] [US4] Integration test: `POST /api/admin/devlog` (valid secret) with `{ sha, message, author, compareUrl, branch }` → exactly one `posts` row (`type='devlog'`, `authorId` null, `status='published'`, `metadata.sha`=the SHA, body/`metadata` carrying message/author/compareUrl) (SC-005).
- [ ] T034 [P] [US4] Integration test: the **same** `sha` posted twice → the second call is a no-op — `posts` still has exactly one row for that slug (US4-AS2, FR-018).
- [ ] T035 [P] [US4] Integration test: a payload carrying `tag` posts `type='changelog'` instead of `'devlog'`; a bad/absent secret is already covered by T023 (cross-referenced, not re-tested here).

### Implementation for User Story 4

- [ ] T036 [US4] Implement `recordDevlogPost({ sha, message, author, compareUrl, branch, deploymentUrl?, tag? })` in `src/server/devlog.ts`: derive `slug = devlog-<sha7>` (or `changelog-<sha7>` when `tag` is present), `INSERT INTO posts ... ON CONFLICT (slug) DO NOTHING`, return `{ created: boolean, postId? }` (data-model.md → Devlog post shape, FR-017/018).
- [ ] T037 [US4] Implement `app/api/admin/devlog/route.ts` (`export const runtime = "nodejs"`): verify the `Authorization: Bearer` secret (constant-time compare, contracts/admin-authz.md) → 401 on failure → parse/validate the JSON payload → call `recordDevlogPost` → 200 `{ created, postId }`.
- [ ] T038 [P] [US4] Add the primary trigger: `.github/workflows/devlog.yml` — a post-deploy step on `push` to `main` that POSTs `{ sha, message, author, compareUrl, branch }` (from the `github` context) with `Authorization: Bearer ${{ secrets.DEVLOG_WEBHOOK_SECRET }}` (research C3).
- [ ] T039 [P] [US4] Document the alternative trigger: a Vercel `deployment.succeeded` webhook to the same endpoint, filtering `target === 'production'` before posting (research C3) — ship whichever the orchestrator prefers; both hit one endpoint, so this is additive, not a fork.

**Checkpoint**: a real push auto-posts exactly one devlog/changelog entry; retries are silent
no-ops; forged calls are rejected before any write — the durable "code push → news" rule is now
mechanical.

---

## Phase 7: User Story 5 — Surface the balancer's fairness report to inform tuning (P3)

**Goal**: an admin can read the latest committed `BalanceReport` read-only inside the console before
tuning; its absence doesn't block editing.

**Independent Test**: point the console at a fixture `BalanceReport` JSON; assert the panel renders
the matchups, the severity-sorted flagged list with reasons, and the four invariants with measured
numbers/margins, gated behind the admin check.

### Tests for User Story 5 ⚠️ (write first)

- [ ] T040 [P] [US5] Component/integration test: given a fixture `BalanceReport`, `<BalanceReportPanel>` renders the matchup table, the flagged list (worst-first, with reasons), and the four invariants with measured/margin values (US5 Independent Test).
- [ ] T041 [P] [US5] Test: given no committed report (`getLatestBalanceReport()` returns `null`), the panel states that clearly and the balance editor remains fully usable alongside it (US5-AS2, FR-019).

### Implementation for User Story 5

- [ ] T042 [US5] Implement `getLatestBalanceReport()` (`src/server/ruleset.ts` or a small `src/server/balance-report.ts`): read the newest committed report file per Feature 2's [balance-report.md](../002-auto-balancer/contracts/balance-report.md) location; return `null` if none exists (contracts/admin-api.md).
- [ ] T043 [US5] Implement `src/components/admin/balance-report-panel.tsx`: read-only render of matchups + severity-sorted `flagged` (with `reason`) + the four `invariants` (measured + margin + pass/fail); a clear empty state when `null`.
- [ ] T044 [US5] Wire the panel into `app/admin/balance/page.tsx` alongside `<RulesetEditor>` (T019), fetched in parallel with `getRulesetForEdit()`.

**Checkpoint**: an admin can read proven imbalance before tuning, without leaving the console — the
balance loop (read report → tune → auto-post) is closed.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T045 [P] Update Feature 8's one call site (`src/server/arena.ts` / `practice.ts`) from `loadCurrentRuleset()` → `getCurrentRuleset()` (T015) — the coordinated rename tracked in plan.md Complexity Tracking; confirm Feature 8's resolve path now reads the real store, not the v1 placeholder.
- [ ] T046 [P] Confirm `revalidateTag('ruleset-current')` busts the editor's/any cached display read on save (research A2), and confirm (by code review + T012's test) that the resolve path (`getCurrentRuleset()`) never goes through a per-instance cache — SC-008's "0 stale reads" is structural, not incidental.
- [ ] T047 [P] Run the full SC-001…SC-008 suite green (Vitest + Playwright) on the Neon dev branch; confirm `next build`, `tsc --noEmit`, and ESLint pass.
- [ ] T048 Update repo docs: `STATUS.md` (flip Feature 12 → built in the Feature-set table) and `CHANGELOG.md` (admin console, live-ruleset store, the two auto-post triggers); per the project's durable "code push → news" convention, this feature is what makes that rule mechanical going forward — no further manual devlog posts are needed after T038/T039 ship.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → depends on Features 1/3/7/8 existing (confirmed, not rebuilt, in T001).
- **Foundational (P2)** → depends on Setup; **blocks all user stories** (the schema + hash/validate/diff primitives + the non-empty store).
- **US1 (P3)** → depends on Foundational; the MVP (the store's read/write core).
- **US2 (P4)** → depends on Foundational; its authz **primitives** (`requireAdmin` calls) are already threaded through US1's actions/routes as they're written — US2's own tasks add the layout/`proxy.ts` layers and the denial-matrix proof. Developed alongside US1, not strictly after it (spec: "co-equal P1").
- **US3 (P5)** → depends on **US1** (extends `saveRuleset` — cannot add the atomic post to a function that doesn't exist yet).
- **US4 (P6)** → depends on Foundational + US2 (the secret-gate pattern); independent of US1/US3 (no ruleset-table interaction at all).
- **US5 (P7)** → depends on Foundational only; independent of US1–US4 (a pure read panel), but shares the `app/admin/balance/page.tsx` file with US1 (T044 extends T019).
- **Polish (P8)** → depends on all desired stories.

### Within a story

Tests (authz/concurrency/atomicity/idempotency) first → service-layer functions → Server
Action/Route Handler wiring → components → route assembly. Commit after each task or logical group
(Principle IX).

### Parallel opportunities

- Setup: T002–T004 in parallel.
- Foundational: T008/T009/T010 in parallel (distinct files) after T005–T007 (schema must exist first for T011's seed).
- US1 tests T012–T014 in parallel; T015→T016→T017 sequential (same file, same function family); T018–T020 mostly sequential (action → page → component).
- US2 tests T021–T023 in parallel; T024/T025 in parallel (different files), T026 last (audits both).
- US3 tests T027–T029 in parallel; T030→T031 sequential (both extend `saveRuleset`); T032 anytime after T031.
- US4 tests T033–T035 in parallel; T036→T037 sequential; T038/T039 in parallel with each other and with Polish.
- US5 is almost entirely parallel to US1–US4 after Foundational (different files) except T044's shared page file with US1's T019.

---

## Implementation Strategy

### MVP first (US1 + US2 together)

1. Setup → 2. Foundational → 3. **US1** (the store's read/write core) developed **with** US2's
`requireAdmin` calls inline from the start (spec frames them as co-equal P1) → 4. **US2**'s own
tasks (layout, `proxy.ts`, the denial matrix) close out the trust boundary explicitly →
**STOP & VALIDATE**: an admin edit demonstrably changes the next match's hash while past replays
stay untouched, AND every denial-matrix case is proven server-side. That alone is a complete,
demonstrable, *safe* live-ops lever.

### Incremental delivery

US1+US2 (the safe live edit) → US3 (auto-published balance news) → US4 (auto-published devlog,
fully independent) → US5 (the advisory report panel). Each adds provable value without breaking
prior stories; the feature is "done" when SC-001…SC-008 are green and `next build`/typecheck/lint
pass.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- **The admin gate is the spine, not a feature of the editor** — US2's tests (T021–T023) must pass
  independent of whether the balance editor UI (US1's components) exists at all; the service-layer
  `requireAdmin` calls are what's load-bearing, not the layout redirect.
- **`saveRuleset` is built incrementally across US1 and US3** (T017 → T030/T031) rather than once —
  matching how Feature 1's `tests/determinism.rs` and `sim/outcome.rs` were extended story-by-story.
  Never treat the US1 version of `saveRuleset` as "done" until US3's atomic post-insert lands.
- **Never regenerate a committed `rulesetHash`** to make a test pass — a hash mismatch between the
  store and a replay is a real bug (provenance broken), not a fixture to update.
- The Feature-8 rename (T045) is a **tracked, deliberate** one-line coordination edit (plan.md
  Complexity Tracking) — not scope creep into Feature 8's code.
