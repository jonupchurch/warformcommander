---
description: "Task list for Feature 9 — Ladder (net-victory leaderboard)"
---

# Tasks: Ladder

**Input**: Design documents from `specs/009-ladder/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [contracts/ladder-read.md](./contracts/ladder-read.md)

**Tests**: **INCLUDED and non-optional.** The feature's whole value is a **correct, deterministic
ranking** and a **both-orientations** board — its Success Criteria (SC-001…SC-008) are executable, and
constitution **Principle VIII** + **P7** require them. The load-bearing tests are the **ranking-order /
tiebreak** and **defense-loss-lowers-rank** unit/integration tests (Vitest) plus the **both-orientation**
Playwright e2e; ordering tests are written **before** the query they pin.

**Depends on**: **Feature 7** (schema + `getLeaderboard`/`getStanding`/`recomputeStanding` + the
`tests/db-setup.ts` dev-branch harness + cold-start `isBot` seed) and **Feature 3** (app shell, tokens,
primitives, the stubbed `app/(app)/ladder/` route). Both must be built first.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 (maps to spec.md); Setup/Foundational/Polish carry no story label
- Paths are exact and match [plan.md](./plan.md) Project Structure. Read module under
  `src/server/ladder/`; components under `src/components/ladder/`; route in `app/(app)/ladder/`; e2e in
  `e2e/`. **Read-only** — no task here writes standings/matches (Feature 7/8 own the write path).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm prerequisites and stand up the ladder folders + test harness reuse.

- [ ] T001 Confirm prerequisites are in place: Feature 7's `src/server/` service (`getLeaderboard`/`getStanding`/`recomputeStanding`), the `ladder_standings`/`matches`/`users` schema, and the `tests/db-setup.ts` dev-branch/transaction helper; Feature 3's `app/(app)/layout.tsx` shell + `src/components/ui/*` primitives. Note any gaps for the orchestrator rather than rebuilding them here.
- [ ] T002 [P] Create the feature folders: `src/server/ladder/`, `src/components/ladder/`; confirm the Feature-3-stubbed `app/(app)/ladder/page.tsx` exists (replace its placeholder in US1).
- [ ] T003 [P] Confirm the Vitest runner + Neon dev-branch test DB (Feature 7 T005) and Playwright + the viewport-matrix helper (Feature 3 T006) are available; add a `ladder`-scoped fixture seeder `tests/fixtures/ladder.ts` (insert known `ladder_standings` + `matches` rows, incl. `isBot` users and a negative-net commander) for the read-module tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The read-only query surface + the pure view-model + validated `searchParams` parsing that
**every** story consumes. Nothing in Phase 3+ can begin until this is done.

**⚠️ CRITICAL**: This is the ordering/tiebreak contract ([contracts/ladder-read.md](./contracts/ladder-read.md))
every story renders.

- [ ] T004 Implement `src/server/ladder/queries.ts` **types + season read**: `LadderMetric`/`LadderRange`/`LadderCursor`/`LadderQueryOpts`/`LadderRowData` (contract §1) and `getLadderPage` for `range="season"` — reads `ladder_standings` (composing/extending Feature 7's `getLeaderboard`), ordered by the **defined tiebreak** (contract §3: `net DESC → totalDamage DESC → userId ASC`), `includeBots` default **true**, keyset/offset paging, computing 1-based `rank`. **Read-only**; go through the server surface (no client DB).
- [ ] T005 Implement `getViewerStanding` in `src/server/ladder/queries.ts`: the signed-in viewer's standing + **computed rank** (`COUNT(*)` ranking above over the composite key), returning `{ state: "unranked" }` when no `ladder_standings` row exists (FR-012). Depends on T004.
- [ ] T006 [P] Implement `src/components/ladder/view-model.ts`: pure `toLadderRows(data, viewerUserId, metric)` and `toViewerStanding(v, metric)` — `LadderRow`/`ViewerStandingVM` (contract §2): signed `netVictoriesLabel` (negatives with sign), `record` string, `profileHref` (→ [Feature 10](../010-profile/) by userId), `isViewer`/`isBot` flags, formatted `metricValueLabel`. No data access.
- [ ] T007 [P] Implement `src/components/ladder/searchparams.ts` (or inline in `page.tsx`): parse + **validate/clamp** `metric`/`range`/`page` from `await searchParams` to the known enums (unknown metric → `net`; out-of-range page → clamp) (Principle II, research B2).

**Checkpoint**: the read surface + view-model + validated params exist; user-story rendering can begin.

---

## Phase 3: User Story 1 — View the net-victory leaderboard and find my rank (P1) 🎯 MVP

**Goal**: `/ladder` renders every commander ranked by **net victories** (attack wins − defense losses)
with the defined tiebreak, a podium for the top 3, negative totals sorted below non-negatives, and the
**viewer's own rank locatable** (highlighted row + pinned card) — first-class in both orientations.

**Independent Test**: seed known standings; render; assert rendered order == `netVictories DESC` + the
tiebreak, a negative total sorts last, and the viewer's rank shows in the pinned card + highlighted row
without scrolling — at 360 (portrait cards) and 1440 (landscape table).

### Tests for User Story 1 ⚠️ (write first)

- [ ] T008 [P] [US1] `src/server/ladder/queries.test.ts`: **order == `netVictories DESC` with the tiebreak** (`totalDamage DESC → userId ASC`) — compare `getLadderPage({metric:'net'})` to an independently-sorted query; **zero discrepancy** (SC-001, AS1/AS2).
- [ ] T009 [P] [US1] `src/server/ladder/queries.test.ts`: a **negative** net-victory commander renders with the sign and sorts **below** all non-negative totals; tied net victories resolve stably and identically across two calls (SC-005, AS3).
- [ ] T010 [P] [US1] `src/server/ladder/queries.test.ts`: `getViewerStanding` returns the correct **rank** for an off-first-page viewer, and `{ state: "unranked" }` for a user with no standing row (SC-006, AS4).
- [ ] T011 [P] [US1] `src/components/ladder/view-model.test.ts`: `toLadderRows` maps fields, formats **signed** net victories (e.g. "−7"), sets `isViewer` on the viewer's row, and builds the Profile `href` (SC-001 mapping).
- [ ] T012 [P] [US1] `e2e/ladder.spec.ts`: at **1440×900** the **table** renders, at **360×640** the **card list** renders; **no horizontal page scroll** at 320 / 360 / 1440 / ultra-wide; the wide table scrolls within its own container only (SC-003, FR-013).
- [ ] T013 [P] [US1] `e2e/ladder.spec.ts`: the viewer's rank is visible in **≤1 interaction** — the pinned "your standing" card is on-screen and "jump to my rank" scrolls to the highlighted own-row — in **both** orientations (SC-004, AS4); a commander handle links to the Profile route (AS6).

### Implementation for User Story 1

- [ ] T014 [US1] Implement `src/components/ladder/ladder-table.tsx` + `ladder-row.tsx` (landscape): a table inside `overflow-x-auto` with columns `RANK · COMMANDER · RECORD · STREAK · NET VICTORIES`, own-row highlight (cyan edge + tint per the mockup), handle → Profile link; tokens/primitives only (Feature 3), `hidden lg:block`.
- [ ] T015 [US1] Implement `src/components/ladder/ladder-card-list.tsx` + `ladder-card.tsx` (portrait): one card per commander — rank + handle on top, **net victories** as the prominent figure, record/streak as secondary; own-card highlight; `lg:hidden`.
- [ ] T016 [P] [US1] Implement `src/components/ladder/podium.tsx`: the top-3 (rank 1 emphasized), consistent with the ordered list; renders in both orientations (AS5).
- [ ] T017 [P] [US1] Implement `src/components/ladder/viewer-standing-card.tsx`: the pinned "your standing" card (rank + net victories) or the **unranked** CTA (→ [Arena](../008-arena/)); always on-screen (FR-004, FR-012).
- [ ] T018 [P] [US1] Implement `src/components/ladder/pagination.tsx`: keyset/offset page controls + a **"jump to my rank"** affordance that navigates to the viewer's page/anchor and focuses the own-row (SC-004).
- [ ] T019 [US1] Implement `src/components/ladder/leaderboard.tsx` (orchestrator): take one `LadderRow[]` + `ViewerStandingVM`, render `Podium` + `LadderTable` (lg) + `LadderCardList` (portrait) + `Pagination`, from the single dataset.
- [ ] T020 [US1] Implement `app/(app)/ladder/page.tsx` (**Server Component**): `await searchParams` → validate (T007) → `getLadderPage` + `getViewerStanding` → `toLadderRows`/`toViewerStanding` → `<Leaderboard>`; render the **shared board cached** (short `cacheLife`/revalidate) and the **per-viewer** card in a **dynamic** slot (research B1); add `app/(app)/ladder/loading.tsx` skeleton. Replace the Feature-3 placeholder.

**Checkpoint**: the net-victory leaderboard renders correctly ordered, both orientations, with the
viewer's rank locatable — the MVP ladder.

---

## Phase 4: User Story 2 — Read a commander's standing: record, streak, total damage (P2)

**Goal**: every standing exposes record (attack W/L, defense W/L), current/best streak, total damage,
and matches played; the metric selector re-orders by real columns; and a **defense loss visibly lowers
rank** (the design stake).

**Independent Test**: seed a standing with known counters; assert every field renders; then record a
defense loss (mutate the seed via Feature 7's path or the fixture) and assert the net-victory total
drops and the row's rank falls.

### Tests for User Story 2 ⚠️ (write first)

- [ ] T021 [P] [US2] `src/server/ladder/queries.test.ts`: **defense-loss-lowers-rank** — two commanders identical but one with an extra defense loss shows a **lower** net-victory total and a **lower** rank; and a before/after where adding a defense loss moves a commander down (SC-002, AS2). Cross-check with Feature 7's `recomputeStanding` as the oracle.
- [ ] T022 [P] [US2] `src/server/ladder/queries.test.ts`: `metric='damage'` orders by `totalDamage DESC` and `metric='defenses'` by `defenseWins DESC`, each with the net-victory tiebreak (contract §3, AS3).
- [ ] T023 [P] [US2] `src/components/ladder/view-model.test.ts`: the `record` string renders `attackWins–attackLosses · defenseWins–defenseLosses`, streaks, and `metricValueLabel` per the selected metric (FR-006).

### Implementation for User Story 2

- [ ] T024 [US2] Extend `ladder-row.tsx` / `ladder-card.tsx` to show the full standing readout — record (attack W/L, defense W/L holds/losses), current/best streak, total damage, matches played — sourced from `LadderRow` (FR-006); the metric column reflects the selected metric.
- [ ] T025 [P] [US2] Implement `src/components/ladder/metric-tabs.tsx` (`"use client"` leaf): **Net Victories / Total Damage / Defenses Held**, updating the `metric` searchParam (Feature 3 tab styling, mockup metric tabs) (FR-005).
- [ ] T026 [US2] Ensure the metric selection flows page → `getLadderPage({ metric })` → re-ordered board (server round-trip via the searchParam), keeping net victories the primary stake (FR-005/FR-007).

**Checkpoint**: a rank is legible as a full record; a defense loss visibly bleeds rank — the design's
stake, verified.

---

## Phase 5: User Story 3 — Per-period views: this week / this month (P2)

**Goal**: switch the board between **Season/All-Time** (`ladder_standings`) and **This Week / This
Month** (rolled up from `matches`, ranked-only, in-window), correctly and consistently.

**Independent Test**: seed `matches` across two weeks; render This Week; assert per-commander
net/damage/defenses reflect only ranked matches in the window and equal an independent recompute;
`practice` matches are excluded.

### Tests for User Story 3 ⚠️ (write first)

- [ ] T027 [P] [US3] `src/server/ladder/queries.test.ts`: `getLadderPage({ range:'week' })` reflects **only** ranked matches with `createdAt` in the week window and **equals** an independent aggregate recompute from `matches`; older matches excluded (SC-007, AS1).
- [ ] T028 [P] [US3] `src/server/ladder/queries.test.ts`: `practice`-mode matches are **excluded** from every period rollup (Feature 7 FR-019, AS3); `range:'month'` widens the window; `range:'season'` reads `ladder_standings` not a rollup (AS2/AS4); an empty window yields an empty result (edge case).

### Implementation for User Story 3

- [ ] T029 [US3] Implement the **period rollup** branch of `getLadderPage` in `src/server/ladder/queries.ts`: a windowed `GROUP BY` over `matches` (`mode='ranked'`, `createdAt` in the week/month window), computing per-commander in-window net victories / total damage / defenses held, ordered by the same tiebreak (research C, contract §1). Calendar week/month windows in the app timezone.
- [ ] T030 [P] [US3] Implement `src/components/ladder/range-tabs.tsx` (`"use client"` leaf): **Season / This Week / This Month**, updating the `range` searchParam (mockup range tabs); render an empty-state for a window with no ranked matches.
- [ ] T031 [US3] Wire `range` through `page.tsx` → `getLadderPage({ range })` / `getViewerStanding({ range })`; note in the view-model that lifetime-only fields (streaks/matchesPlayed) are shown as in-window counts or omitted in period views (contract §1).

**Checkpoint**: the board answers "who's winning this week" from `matches`, correctly and consistently
with the season view.

---

## Phase 6: User Story 4 — Understand the net-victory model (P3)

**Goal**: an inline, always-available explainer of `netVictories = attackWins − defenseLosses` and that
**defense losses subtract** — legible in both orientations, not obscuring the board.

**Independent Test**: render the Ladder; assert the explainer is present and legible in both
orientations, states the formula, and calls out that defense losses subtract; it never pushes the board
into horizontal overflow.

### Tests for User Story 4 ⚠️ (write first)

- [ ] T032 [P] [US4] `e2e/ladder.spec.ts`: the net-victory explainer is present and readable at **360×640** and **1440×900**, states "net victories = attack wins − defense losses" and that defense losses **subtract**, and causes no horizontal page scroll (SC-003, AS1/AS3).

### Implementation for User Story 4

- [ ] T033 [US4] Implement `src/components/ladder/net-victory-explainer.tsx`: an inline panel (Feature 3 `Panel`/`SectionLabel`) stating the model — attack wins add, defense losses subtract, a weak defense bleeds rank (§13) — with a compact form for portrait; place it near the viewer's own standing so a negative total's cause is legible (AS2).
- [ ] T034 [US4] Render the explainer in `page.tsx`/`leaderboard.tsx` and confirm it collapses gracefully in portrait (no overflow, FR-010/FR-013).

**Checkpoint**: a player understands *why* their rank moved — the ranking model is transparent (P4).

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T035 [P] Verify **P5 never-empty** end-to-end: with only seeded `isBot` standings present the board renders populated; the `includeBots=false` humans-only toggle changes nothing else (SC-008) — an integration test + a manual check against the Feature 7 cold-start seed.
- [ ] T036 [P] Add the recommended read-only composite index `(net_victories DESC, total_damage DESC, user_id)` on `ladder_standings` for keyset paging (a Drizzle index add via Feature 7's migration flow — **read-side, no write-path change**); confirm the season query plan uses it. If deferred, note offset paging remains correct at v1 scale (research A2).
- [ ] T037 [P] Run the full SC-001…SC-008 suite green (Vitest + Playwright) on the Neon dev branch; wire the ladder e2e into the CI viewport matrix; confirm `next build`, `tsc --noEmit`, and ESLint (incl. the no-raw-hex guard) pass.
- [ ] T038 Update repo docs: `CHANGELOG.md` (Ladder screen — net-victory leaderboard, per-period rollups, both-orientation) and note for the orchestrator to flip Feature 9 → built in `STATUS.md`; queue a devlog news note per the repo's "code push → news" convention (once the News system ships).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → depends on Feature 7 + Feature 3 being built.
- **Foundational (P2)** → depends on Setup; **blocks all user stories** (the read surface + view-model).
- **US1 (P3)** → depends on Foundational; the MVP (the ordered board + own rank).
- **US2 (P4)** → depends on **US1** (extends the rows + adds metric ordering; the defense-loss test rides the board).
- **US3 (P5)** → depends on Foundational + US1 (adds the period branch + range tabs; largely parallel to US2 — different files).
- **US4 (P6)** → depends on US1 rendering (adds an explainer panel).
- **Polish (P7)** → depends on all desired stories.

### Within a story

Tests (ordering/tiebreak/mapping first) → read-query branch → components → route wiring. Commit after
each task or logical group (Principle IX).

### Parallel opportunities

- Setup: T002/T003 in parallel.
- Foundational: T006/T007 parallel to T004→T005 (different files).
- US1 tests T008–T013 all `[P]`; then components T014/T015 parallel, T016–T018 parallel, T019→T020 sequential.
- US2 (T021–T023 tests `[P]`) and **US3** (T027/T028 tests `[P]`) can be worked in parallel after US1 — different files (`metric-tabs`/`range-tabs`, distinct query branches).
- US4 T032 (test) then T033/T034.

---

## Implementation Strategy

### MVP first (US1)

Setup → Foundational → **US1** → **STOP & VALIDATE**: the leaderboard renders ordered by net victories
with the tiebreak (SC-001), a defense-heavy commander sits low, and the viewer finds their rank in both
orientations (SC-003/SC-004). That alone is a complete, demonstrable ladder.

### Incremental delivery

US1 (net-victory board + my rank) → US2 (standing detail + defense-loss-lowers-rank + metrics) → US3
(per-period rollups) → US4 (net-victory explainer). Each adds value without breaking prior stories; the
feature is "done" when SC-001…SC-008 are green and `next build`/typecheck/lint pass.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- **Read-only is the spine**: no task writes standings/matches — Feature 7/8 own the write path; the
  Ladder reads through the server surface only (P6, FR-015). Never add client DB access.
- **The tiebreak is the determinism contract** (contract §3): `net DESC → totalDamage DESC → userId ASC`.
  Any change to it is an intended, tested change — never to make a flaky order test pass.
- **P7 is verified at 360 *and* 1440** — never one. A dense table only exists in landscape; portrait is
  the card list (SC-003).
- **Seasons/MMR/tiers/trend stay deferred** (spec FR-016) — presentational chrome only; do not wire them
  to data or add a season partition in v1.
