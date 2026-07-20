---
description: "Task list for Feature 6 — Battle Summary"
---

# Tasks: Battle Summary

**Input**: Design documents from `specs/006-battle-summary/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/view-model.md](./contracts/view-model.md)

**Tests**: **INCLUDED and non-optional.** The feature's correctness claim is that the display **faithfully
represents every `MatchResult` field** (SC-001/003) and is **first-class in both orientations** (SC-004,
P7). Those are executable tests (a pure ViewModel unit suite + a Playwright both-orientation suite), written
**before** the code they pin where practical (Principle VIII).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 (maps to spec.md user stories); Setup/Foundational/Polish carry no story label
- TS lib under `src/lib/battle-summary/`; components under `src/components/battle-summary/`; route under
  `app/(app)/matches/[matchId]/summary/`; e2e under `e2e/`. Feature 1 types imported from `src/sim/`;
  Feature 3 primitives from `src/components/{ui,shell,brand}/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the route + module folders and the result fixtures every story tests against.

- [ ] T001 Create the folders + placeholders: `app/(app)/matches/[matchId]/summary/` (`page.tsx`,
  `loading.tsx`, `error.tsx` stubs), `src/components/battle-summary/`, `src/lib/battle-summary/`. Per
  plan.md Project Structure.
- [ ] T002 [P] Add a **`MatchResult` fixture battery** in `src/lib/battle-summary/__fixtures__/results.ts`:
  a 2-0 Conquest sweep, a 2-1 with a middle-game Time loss, a viewer **defeat**, a **Time-tiebreak** win, an
  **exact-tie → defender** game, a **total wipe** (0 survivors / 0% hull), and an **all-survivors** Time
  game — each a valid Feature-1 `MatchResult` (+ a matching `meta.unitOrder`). These pin SC-001/003/005.
- [ ] T003 [P] Confirm the Feature 1 TS result types (`MatchResult`, `GameResult`, `Side`, `Replay.meta`)
  are importable from `src/sim/`; if the mirror is not yet present, add a **local type reference** in
  `src/lib/battle-summary/types.ts` that re-exports/points at the Feature 1 contract (do **not** redefine
  the shapes — reference [../001-battle-sim-core/data-model.md](../001-battle-sim-core/data-model.md)).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The **pure derivation** + format helpers that every story renders from. Nothing in Phase 3+ can
render until the ViewModel exists.

**⚠️ CRITICAL**: `deriveSummaryViewModel` is the logic core; the components are thin renderers of its output.

- [ ] T004 Implement `src/lib/battle-summary/format.ts`: pure helpers — `ticksToSeconds(ticks, tickRate)` →
  `"8.2s"`; `killedLost(survivorCounts, viewerSide)` → per-side units-killed/lost (5-unit army, FR-008);
  `avgHullLeft(perMachineFates, side)` → % (0 on wipe). No I/O.
- [ ] T005 Implement `src/lib/battle-summary/view-model.ts` — `deriveSummaryViewModel(result, ctx)` per
  [contracts/view-model.md](./contracts/view-model.md): pure + total; builds `outcome`, `series`, `perGame`,
  `totals`, `perMachine`, optional `mvp`, optional `standing`, `actions`. Perspective from `ctx.viewerSide`
  (FR-003). Depends on T004; imports Feature 1 types (T003).
- [ ] T006 [P] Implement the optional **MVP reduction** `src/lib/battle-summary/mvp.ts`:
  `perMachineDamageFromEvents(replayGames, unitOrder)` → per-actor `{ damageDealt, kills, damageAbsorbed }`
  via a **single O(events) reduction** (research [D3](./research.md)); **no re-simulation**. Feeds
  `ctx.perMachineDamage`. Pure; returns `undefined` when events are absent so `mvp` is simply omitted.

**Checkpoint**: the ViewModel derives from a `MatchResult`; components can be built against it.

---

## Phase 3: User Story 1 — See who won the match and why (P1) 🎯 MVP

**Goal**: render the outcome hero (VICTORY/DEFEAT), the series score (2-0 / 2-1) with per-game pips, and each
game's win condition (Conquest vs Time) + reward tier (Full vs Lesser) — unambiguously.

**Independent Test**: feed the fixture battery through `deriveSummaryViewModel` + render; assert verdict,
series score, per-game W/L, condition, and tier match the result — including a Time-tiebreak-vs-Conquest and
a defeat.

### Tests for User Story 1 ⚠️ (write first)

- [ ] T007 [P] [US1] `src/lib/battle-summary/view-model.test.ts`: **full-field representation** — for every
  fixture, every `MatchResult` field (winner; each `GameResult`'s winner/condition/rewardTier/durationTicks;
  per-machine fates; perSideDamageTotals; survivorCounts) is present in the ViewModel (SC-001).
- [ ] T008 [P] [US1] `view-model.test.ts`: **win-condition + tier** — a Conquest game derives
  `CONQUEST`/`FULL`; a Time game derives `TIME`/`LESSER`; a Time-tiebreak win never derives `CONQUEST`
  (SC-002). Includes the **exact-tie → defender** `conditionDetail` (AS: edge case).
- [ ] T009 [P] [US1] `view-model.test.ts`: **perspective + series** — flipping `viewerSide` flips `verdict`
  and the series W/L; a 2-0 yields 2 pips, a 2-1 yields 3 (SC-005, FR-003/004).

### Implementation for User Story 1

- [ ] T010 [P] [US1] `src/components/battle-summary/series-pips.tsx`: the per-game W/L pills (G1/G2/G3) from
  `vm.series`, cyan (W) / enemy-tint (L), `Chip`/token-driven (Feature 3), color **plus** the W/L glyph
  (FR-016).
- [ ] T011 [US1] `src/components/battle-summary/outcome-hero.tsx`: the hero — `BEST OF 3` eyebrow, big
  `VICTORY`/`DEFEAT` (`font-display`, text via token not color-only), `Won 2 – 1 vs <opponent>`, and the
  `SeriesPips`; slot for `StandingDelta` (US4). Grounded in the mockup's outcome hero.
- [ ] T012 [US1] `src/components/battle-summary/game-breakdown.tsx`: the per-game cards from `vm.perGame` —
  W/L badge, `GAME N`, `CONQUEST`/`TIME · DMG` (`Chip`), `FULL`/`LESSER` tier, survivors (`4 vs 0`),
  duration (`8.2s`). Conquest vs Time visually **and** textually distinct (SC-002).
- [ ] T013 [US1] Wire `app/(app)/matches/[matchId]/summary/page.tsx` (Server Component): fetch the
  `MatchResult` + `meta` for `matchId` via Feature 7 (scoped to the viewer), `deriveSummaryViewModel(...)`,
  render inside the Feature 3 `AppShell` with `OutcomeHero` + `GameBreakdown`. `error.tsx`/`not-found` for a
  missing/unowned match (FR-018).

**Checkpoint**: the summary shows the outcome, series, and per-game condition/tier — a complete MVP result
screen.

---

## Phase 4: User Story 2 — Per-machine fates and the damage breakdown (P2)

**Goal**: the match-totals comparison bars, per-game survivors/duration (from US1's cards), the per-machine
fate rows, and the optional MVP.

**Independent Test**: given a result with populated totals/survivors/fates, assert the rendered totals equal
the result totals (zero drift), each machine shows the right fate keyed to the right identity, and a
total-wipe vs all-survivors both render.

### Tests for User Story 2 ⚠️ (write first)

- [ ] T014 [P] [US2] `view-model.test.ts`: **totals equality** — `totals.damageDealt` deep-equals
  `perSideDamageTotals`; `unitsKilled/unitsLost/avgHullLeft` are exact functions of `survivorCounts` +
  fates; 0% avg hull on a total wipe (SC-003, FR-008).
- [ ] T015 [P] [US2] `view-model.test.ts`: **per-machine fates** — each machine maps to
  `destroyed@tick`/`survived@hull%` keyed to the correct `unitOrder` identity (type/variant/side); the
  destroyed-at-tick-0 and survived-at-100% extremes render (FR-009).
- [ ] T016 [P] [US2] `src/lib/battle-summary/mvp.test.ts`: the event reduction sums per-actor damage
  correctly and `Σ` reconciles with `perSideDamageTotals` (Feature 1 SC-002); `mvp` is **omitted** when no
  per-machine damage is available (FR-010).

### Implementation for User Story 2

- [ ] T017 [P] [US2] `src/components/battle-summary/match-totals.tsx`: the you-vs-them dual bars (damage /
  units killed / units lost / avg hull) via Feature 3 `StatBar`, viewer=friendly / opponent=enemy tint;
  values equal the result (SC-003). The `1fr / label / 1fr` grid that stacks cleanly in portrait (D4).
- [ ] T018 [P] [US2] `src/components/battle-summary/per-machine-fates.tsx`: the fate rows from
  `vm.perMachine` — `UnitIcon` (type, faction tint), variant, and `destroyed 3.1s` / `survived 41% hull`;
  grouped by side.
- [ ] T019 [P] [US2] `src/components/battle-summary/mvp-card.tsx`: the optional MVP (`vm.mvp`) — `UnitIcon`,
  name, `variant · zone`, damage dealt / kills / dmg absorbed; **renders nothing** when `vm.mvp` is absent
  (FR-010).
- [ ] T020 [US2] Extend `page.tsx`: pass `ctx.perMachineDamage` (from `mvp.ts` when events are available),
  and add `MatchTotals` + `PerMachineFates` + `MvpCard` to the layout (game breakdown beside MVP in
  landscape, stacked in portrait — D4).

**Checkpoint**: the summary shows the full damage/fate breakdown; totals equal the result.

---

## Phase 5: User Story 3 — Watch the replay, rematch, or return (P2)

**Goal**: the action row — Watch Full Replay (→ Feature 5), Find Next Opponent (→ Feature 8), Back — with the
replay hand-off keyed to `matchId` and **no** replay player mounted here.

**Independent Test**: render the actions and assert the watch-replay control targets Battle Playback for this
match's replay, the next-opponent control targets Arena, a back control exists, and the page triggers no
simulation/playback.

### Tests for User Story 3 ⚠️

- [ ] T021 [P] [US3] `e2e/battle-summary.spec.ts`: **action seams** — `Watch Full Replay` navigates to the
  Battle Playback route for `matchId`; `Find Next Opponent` navigates to the Arena; a back affordance
  exists; the summary mounts no replay/canvas player (SC-007).

### Implementation for User Story 3

- [ ] T022 [US3] `src/components/battle-summary/summary-actions.tsx`: the centered action row from
  `vm.actions` — `Watch Full Replay` (secondary), `Find Next Opponent` (primary CTA, cyan glow),
  `Back to Arena` (ghost), all `next/link` + Feature 3 `Button`; keyboard-operable with visible focus
  (FR-013, Feature 3 baseline). Full-width stacked in portrait, centered row in landscape (D4).
- [ ] T023 [US3] In `view-model.ts`, populate `vm.actions` hrefs from `ctx.replayRef.matchId` (watch-replay
  → Feature 5 path; next-opponent → Arena; back → Arena/Garage). Add `SummaryActions` to `page.tsx`.

**Checkpoint**: the player can watch the replay, line up the next match, or return — the loop closes.

---

## Phase 6: User Story 4 — See the ranking change (P3)

**Goal**: the net-victory standing delta for a ranked match; nothing (labeled UNRANKED) for a practice
match, with the opponent hidden (§16.1).

**Independent Test**: given a ranked standing delta, assert `+1 NET VICTORY · before → after`; given a
practice match, assert no delta and an UNRANKED label with the opponent anonymized.

### Tests for User Story 4 ⚠️

- [ ] T024 [P] [US4] `view-model.test.ts`: **standing** — ranked win → `standing.delta = +1` with correct
  `before`/`after` and label; an attack loss → no decrease; a **practice** match → `mode:"practice"`,
  `label:"UNRANKED"`, no delta, and `opponent.hidden = true` (SC-006, FR-011/017).

### Implementation for User Story 4

- [ ] T025 [US4] `src/components/battle-summary/standing-delta.tsx`: the ladder panel from `vm.standing` —
  `+1 NET VICTORY` + `47 → 48` (ranked), or `UNRANKED` (practice); token-driven, slotted into the
  `OutcomeHero`. **No MMR/tier** rendered (D2 — that is Feature 9).
- [ ] T026 [US4] In `page.tsx`, read the ranked/practice **mode + standing delta** from Feature 7 for
  `matchId` (server-side, never client-computed — P6), pass into `ctx.standing`, and anonymize the opponent
  for practice (FR-017, §16.1).

**Checkpoint**: a ranked match shows its net-victory swing; a practice match shows none.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T027 [P] **Both-orientation render** `e2e/battle-summary.spec.ts`: drive the summary at **360×640
  (portrait)** and **1440×900 (landscape)**, plus **320px** min and an ultra-wide width; assert **zero
  horizontal scroll**, all sections reachable, and the layout switches (stacked ↔ multi-column) at the
  Feature 3 breakpoint (SC-004, P7, D4).
- [ ] T028 [P] **Reduced motion + legibility** `e2e/battle-summary.spec.ts`: with
  `prefers-reduced-motion: reduce`, decorative reveal/glow is suppressed and every outcome fact (verdict,
  condition, tier) is present as **text** (SC-008, FR-016).
- [ ] T029 [P] `loading.tsx` skeleton (result fetch) + `error.tsx` (missing/unowned/unrenderable match)
  using Feature 3 primitives (FR-018).
- [ ] T030 [P] Accessibility pass: `UnitIcon` accessible names, the verdict as a proper heading landmark,
  opponent-name truncation (long-name edge case), and an axe check on the rendered summary (Feature 3
  SC-004 parity).
- [ ] T031 [P] Confirm **token-only styling** (no raw hex; Feature 3 SC-002) across
  `src/components/battle-summary/*` via the repo lint/convention.
- [ ] T032 Update `STATUS.md` / `CHANGELOG.md` (Feature 6 — Battle Summary planned/built) once implemented.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → depends on Setup; **blocks all stories** (everything renders from the ViewModel).
- **US1 (P3)** → depends on Foundational; the MVP screen.
- **US2 (P4)** → depends on Foundational + US1's page wiring (adds panels to the same layout).
- **US3 (P5)** → depends on US1 (adds the action row + href derivation).
- **US4 (P6)** → depends on US1 (slots the standing panel into the hero) + Feature 7's standing read.
- **Polish (P7)** → depends on the stories being present.

### Within a story

Tests (pure ViewModel unit / Playwright) first → derivation → components → page wiring. Commit after each
task or logical group (Principle IX).

### Parallel opportunities

- Setup: T002/T003 in parallel.
- Foundational: T006 (MVP reduction) parallel to T004/T005.
- US1 tests T007–T009 parallel; components T010 parallel to the derivation once T005 lands.
- US2 tests T014–T016 parallel; components T017–T019 parallel (distinct files).
- Polish T027–T031 all `[P]`.

### Cross-feature dependencies (read-only seams — surfaced per Principle VII)

- **Feature 1** — the `MatchResult`/`GameResult`/`Replay.meta` **types** and the SC-002 reconciliation
  guarantee (imported from `src/sim/`; reused, not redefined).
- **Feature 3** — the app shell, tokens, and primitives every component composes.
- **Feature 7** — the **read path** for the persisted `MatchResult` + replay reference + net-victory
  standing delta (this feature designs no storage).
- **Feature 5** (Battle Playback) — the **Watch Replay** hand-off target (linked, not built).
- **Feature 8** (Arena) — the **Find Next Opponent** target (linked, not built).
- **Feature 9** (Ladder) — owns MMR/tiers/seasons/leaderboard; this screen shows only the net-victory delta.

---

## Implementation Strategy

### MVP first (US1)

1. Setup → 2. Foundational (the pure ViewModel) → 3. **US1** → **STOP & VALIDATE**: the outcome, series, and
per-game condition/tier render correctly for the whole fixture battery (SC-001/002/005). That alone is a
complete, useful Battle Summary.

### Incremental delivery

US1 (outcome + why) → US2 (fates + damage breakdown + MVP) → US3 (replay/rematch/return actions) → US4
(ranking delta). Each adds value without breaking the prior; the feature is "done" when the ViewModel unit
suite (SC-001/002/003/005/006) and the Playwright both-orientation/reduced-motion/action-seam suite (SC-004/
007/008) are green.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- The **pure ViewModel is the spine**: all the logic lives in `view-model.ts`/`format.ts`/`mvp.ts`; the
  components are thin renderers. Keep it pure (no I/O, no engine, no re-sim) so SC-001/003 stay unit-testable.
- This screen is a **reader** — never re-simulate, never recompute the winner, never render MMR/tiers (that
  is Feature 5 / Feature 1 / Feature 9). If a value isn't in the result or the read-in standing, it isn't on
  this screen.
