---
description: "Task list for Feature 5 — Battle Playback"
---

# Tasks: Battle Playback

**Input**: Design documents from `specs/005-battle-playback/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/battle-view.md](./contracts/battle-view.md)

**Tests**: **INCLUDED and non-optional.** This feature exists to fix a previously-broken
replay viewer — its Success Criteria (SC-001…SC-010) are executable, and constitution
**Principle VIII** + **P6/P7** require them. The **anti-regression tests** (seek is O(1) and
the engine is never invoked — SC-003/SC-005) and the **both-orientation** scrubber tests
(SC-004) are the load-bearing checks; they are written **before** the code they guard.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 (maps to spec.md user stories); Setup/Foundational/Polish carry no story label
- Paths are exact and match [plan.md](./plan.md) Project Structure. Components under
  `src/components/battle/`; reader extension in `src/sim/replay-view.ts`; route in
  `app/(app)/battle/[matchId]/`; e2e in `e2e/`.

**Dependencies consumed** (not built here): Feature 1's `src/sim/replay-reader.ts` + Replay
types; Feature 3's `AppShell`/`UnitIcon`/`Button`/`Panel`/`StatBar`/tokens; Feature 7's
`getReplay` (server fetch). See [plan.md](./plan.md) "Dependencies consumed".

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the component group, the route skeleton, test wiring, and fixtures.

- [x] T001 Created the component group folder `components/battle/` (root-level, **not** `src/` — repo convention); `@/*` resolves `@/components/battle/*` + `@/sim/*`.
- [x] T002 [P] Created the route skeleton `app/(app)/battle/[matchId]/page.tsx` (Server Component stub — async `params`), `loading.tsx` (skeleton), and `error.tsx` (graceful "replay unavailable / unsupported format" state) per [contracts/battle-view.md](./contracts/battle-view.md) §4.
- [x] T003 [P] Added fixtures: the **real native-emitted Bo3** wire replay (`tests/fixtures/replay-battery.json`, 2×145 ticks, deaths + support — `cargo run -p engine --example emit_battery`), plus a synthetic **large (1000-tick)**, **planb/death**, **tiny (2-tick)**, and **unsupported-formatVersion** builder (`tests/replay-fixtures.ts`).
- [~] T004 [P] Unit runner wired: **pure Vitest** suites for the reader-extension + reducer (`tests/replay-view.test.ts`, `tests/use-playback.test.ts`). The Playwright `e2e/battle-playback.spec.ts` scaffold is **deferred** (browser-gated — written with the interactive stories).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The **pure reader extension** and the **player-state machine + rAF loop** that
every story consumes. Nothing in Phase 3+ can begin until this is done.

**⚠️ CRITICAL**: This is the seek primitive (`replay-view.ts`) and the playback state machine
(`use-playback.ts`) — the P6 spine. Both are engine-free by construction.

- [x] T005 Implemented `sim/replay-view.ts` — `createReplayView(replay, playerSide)` + `ReplayView`: `lastTick`, `snapshotAt` (**O(1) index**), `eventsAt` (O(1)), `unitMaxHull`/`unitMaxShield` (**tick-0 baseline**), `gamesCount`, `tickRate`, `unitOrder` — over Feature 1's `replay-reader.ts`. No engine import (SC-005 test); gates `formatVersion` via the reader.
- [x] T006 [US-shared] Implemented `buildViewModel(gameIndex, tick)` + the `UnitView`/`SideView`/`BattleViewModel`/`SideStats` projections in `sim/replay-view.ts` — bucket by `zoneIdx` (player `[Rear,Middle,Front]` / enemy `[Front,Middle,Rear]`), `hullPct`/`shieldPct` vs tick-0 baseline, `alive`. **Kept UI-pure**: `UnitView` carries raw `typeId`; the `typeId→UnitIcon` map is the render leaf's job (so `sim/` never imports `components/`). Pure function of `(gameIndex, tick)` — frame-accurate vs `snapshotAt` (SC-001 test).
- [x] T007 [P] Implemented `deriveMarkers(gameIndex)` — one pass over `events` collecting `planb`/`death` into `TimelineMarker[]` (tick, kind, side, unitInstanceId, label, position), memoized per game (FR-015).
- [x] T008 Implemented `components/battle/use-playback.ts` (`"use client"`) — the pure exported `playbackReducer` (`play`/`pause`/`tick`/`seek`/`step`/`setSpeed`/`selectGame`, halts at `lastTick`) + `drainTicks`/`msPerTickAt` pacing + the `requestAnimationFrame` accumulator loop (100/speed ms → integer `tick`, cleaned up on pause/unmount), exposing `PlaybackApi`. `seek` is synchronous + O(1); loop dispatches only `tick`.

**Checkpoint**: the O(1) seek primitive + the playback state machine exist, both engine-free.

---

## Phase 3: User Story 1 — Watch a stored replay from start to finish (P1) 🎯 MVP

**Goal**: press Play → the battle advances tick-by-tick across the 4 zones per side at 10 t/s,
units render at their snapshot state with hull/shield bars + death treatment, and playback
halts cleanly at the last tick — all by indexing the reader, never the engine.

**Independent Test**: load a fixture Replay, press Play, assert the battle advances 0→last at
~10 t/s, each rendered unit equals `reader.snapshotAt(tick)`, playback halts at last tick, and
`@wfc/engine-wasm` is never imported/invoked.

### Tests for User Story 1 ⚠️ (write first)

- [x] T009 [P] [US1] Reducer tests live in `tests/use-playback.test.ts` (repo root, not `src/`) — `play`/`pause`/`tick` transitions; `tick` clamps at `lastTick` and sets `isPlaying=false` at the end (FR-010, AS2/AS3). Green.
- [x] T010 [P] [US1] `tests/replay-view.test.ts`: `buildViewModel(g, t)` for a sweep of ticks equals the per-unit hull/shield/zone/alive from `snapshotAt(g, t)` (SC-001, AS1/AS4). Green.
- [x] T011 [P] [US1] `e2e/battle-playback.spec.ts`: load → Play advances the tick and **halts at the last tick**; a destroyed unit shows the DOWN treatment (AS1/AS2/AS4). Green (Playwright/Chromium).

### Implementation for User Story 1

- [x] T012 [P] [US1] `components/battle/unit-sprite.tsx` (root-level, repo convention) — one `UnitView` at its tick state: `UnitIcon` (faction tint via `currentColor`, owns the `typeId→icon` map) + token-styled hull/shield bars + numeric readout + dead treatment (dimmed + "DOWN"); VFX hook (`events` prop) stubbed for US5/T037 (FR-006).
- [x] T013 [P] [US1] `components/battle/zone-column.tsx` — a zone's unit stack (Air row **or** a ground column), empty-state em-dash, zone label bar tinted by the `--zone-*` token (FR-005).
- [x] T014 [US1] `components/battle/contact-line.tsx` (center strip + motion-safe `progress` node) and `components/battle/battle-stage.tsx` — the two-side, 4-zone DOM/grid battlefield from a `BattleViewModel` (player Fronts vs enemy Fronts at the contact line, §4/mockup); `minmax(0,1fr)` columns shrink rather than overflow (FR-005).
- [x] T015 [US1] `components/battle/overall-stats.tsx` — per-side alive `n/total` / summed hull / damage-dealt + game/tick/time readout (FR-008), from the current-tick projection.
- [x] T016 [US1] `components/battle/battle-player.tsx` (`"use client"`) — constructs `createReplayView(replay, playerSide)` (graceful reject on unsupported format), drives `usePlayback`, composes `OverallStats` + `BattleStage` + a play/pause button; `app/(app)/battle/[matchId]/page.tsx` renders it from a documented demo-replay seam (F7 `getReplay` swaps in). MVP: play/pause + auto-advance works end to end (SSR smoke + build green).

**Checkpoint**: a stored replay plays start→finish across the zones — the watchable MVP.

---

## Phase 4: User Story 2 — Scrub and seek to any tick (P1) — the working scrubber

**Goal**: drag/click/arrow the scrubber → the battle jumps to that tick instantly, mid-play or
paused, as one O(1) index into `snapshots[targetTick]` — **never** a re-simulation. This is the
fix for the previous game's broken viewer.

**Independent Test**: drive the scrubber to a random battery of ticks (0/last/mid/mid-death)
while paused and playing; each seek renders `snapshotAt(tick)` within a frame; **no engine
call**; a last-tick seek touches the same # of array reads as a tick-1 seek (O(1)).

### Tests for User Story 2 ⚠️ (write first — the anti-regression is central)

- [x] T017 [P] [US2] `tests/replay-view.test.ts`: **O(1) seek** — instruments `snapshotAt` (a read counter) and asserts seeking `lastTick` of the 1000-tick fixture performs the **same bounded reads** as seeking tick 1 (no O(tick) loop), incl. the full `buildViewModel` projection (SC-003). Green.
- [x] T018 [P] [US2] `tests/replay-view.test.ts`: **the engine is never imported** — a static import-specifier scan over `sim/replay-view.ts` **+ every `components/battle/*` file** (parametrized) asserts no `@wfc/engine-wasm` / `@/sim` / `sim/engine` import (SC-005 — the anti-regression for the previous game's bug). Green (9 modules).
- [x] T019 [P] [US2] `tests/use-playback.test.ts`: `seek(t)` clamps to `[0,lastTick]` in one dispatch (no fast-forward); seek-during-play preserves `isPlaying` (jump-and-continue), seek-paused stays paused (jump-and-stay) (FR-011/FR-012, research B5). Green.
- [x] T020 [P] [US2] `e2e/battle-playback.spec.ts`: keyboard Home/End/Arrow ±1/PageUp-Down ±10 seek exactly (paused); seek mid-play = jump-and-continue (AS1–AS4). Green.

### Implementation for User Story 2

- [x] T021 [US2] `components/battle/scrubber.tsx` (`"use client"`) — the **WAI-ARIA media-seek slider** on a native `<input type="range">`: implicit `role="slider"` + `aria-valuenow/min/max`, human-readable `aria-valuetext`; pointer drag/click-on-track + Arrow ±1 / Home/End native, **PageUp/PageDown overridden to ±10**; every change is one O(1) `onSeek`; `--faction-friendly` accent + visible `--ring` focus (contract §3, research C1/C2).
- [x] T022 [US2] Wired the `Scrubber` into `BattlePlayer` bound to `usePlayback.seek`/`currentTick`/`lastTick`, with the tick·time readout; seeking mid-playback keeps readout + frame in sync (FR-012). US1 tests re-run green.

**Checkpoint**: the scrubber seeks any tick instantly, O(1), never re-simulating — the headline fix, proven by T017/T018.

---

## Phase 5: User Story 3 — Speed, frame-step, jump (P2)

**Goal**: 0.5×/1×/2× speed, frame-step while paused, jump-to-start/end, and Skip-to-Outcome —
the full control cluster.

**Independent Test**: set each speed and assert 5/10/20 t/s; frame-step moves exactly the step
and pauses; jump-to-end sets `currentTick=lastTick`.

### Tests for User Story 3 ⚠️ (write first)

- [x] T023 [P] [US3] Pacing cadence covered by `tests/use-playback.test.ts` "pacing math" — `msPerTickAt` = 100/50/200 and `drainTicks` yields 10/20/5 ticks per 1000 ms at 1×/2×/0.5× with the sub-tick remainder carried (SC-006). The rAF loop that drives these under fake timers is deferred to the e2e layer.
- [x] T024 [P] [US3] `tests/use-playback.test.ts`: `step(±n)` pauses and moves exactly `n`, clamped to `[0,lastTick]`; `selectGame(g)` resets to tick 0, paused (FR-014/FR-009, AS2/AS3). Green.
- [x] T025 [P] [US3] `e2e/battle-playback.spec.ts`: the 2× toggle sets `aria-pressed`; frame-step moves exactly one tick + pauses; jump-to-start/end move to 0/last (AS1–AS3). Green.

### Implementation for User Story 3

- [x] T026 [US3] `components/battle/playback-controls.tsx` (`"use client"`) — jump-start ⏮ / ◄◄ frame-step / play-pause (↺ replay at end) / ►► frame-step / jump-end ⏭ / a 0.5×/1×/2× speed toggle group / "Skip to Outcome →", all Feature 3 `Button`s with `aria-label`s; keyboard-operable (contract §3, research C2).
- [x] T027 [US3] Wired `PlaybackControls` into `BattlePlayer` (bound to `usePlayback` `setSpeed`/`step`/`toggle` + `seek(0)`/`seek(lastTick)` for jump); replaced US1's minimal button; **Space/`K` play-toggle** on the player region (skips Space when a control owns it). US1/US2 tests re-run green.

**Checkpoint**: pace is fully controllable; the control cluster matches the mockup.

---

## Phase 6: User Story 4 — Event markers on the timeline (P2)

**Goal**: Plan-B and death markers annotate the scrubber, each activatable to seek and labelled
for screen readers; computed once per game.

**Independent Test**: fixture with known `planb`/`death` events → a marker at each tick at
`tick/lastTick`, labelled, activating one seeks to its tick.

### Tests for User Story 4 ⚠️ (write first)

- [x] T028 [P] [US4] `tests/replay-view.test.ts`: `deriveMarkers(g)` returns a marker per `planb`/`death` at the right tick/side (real battery deaths + a synthetic planb), computed in one pass, referentially stable across calls (memoized) (FR-015, AS1/AS4). Green.
- [x] T029 [P] [US4] `e2e/battle-playback.spec.ts`: markers render with labels; activating the first marker **seeks to its tick** (AS1–AS3). Green.

### Implementation for User Story 4

- [x] T030 [US4] `components/battle/timeline-markers.tsx` — absolutely-positioned marker buttons at `position*100%`, tinted by kind/side (death = faction color, Plan-B = middle-zone accent), focusable/activatable → `onSeek(tick)`, `label` as accessible name; `pointer-events-none` container so only the dots intercept and the rest of the track still seeks (contract §3, FR-015).
- [x] T031 [US4] `Scrubber` wraps the slider in a positioned track and overlays `TimelineMarkers`; `BattlePlayer` passes `useMemo(() => view.deriveMarkers(gameIndex))` so markers recompute only on game change, never per frame/seek (US4-AS4).

**Checkpoint**: the timeline tells the battle's story; markers seek and are accessible.

---

## Phase 7: User Story 5 — Both orientations, accessible, motion-safe (P3)

**Goal**: the whole surface is first-class in portrait AND landscape (P7), a keyboard/SR-operable
media player, with a reduced-motion path — hardened and audited.

**Independent Test**: Playwright at 360×640 / 1440×900 / 320px → no h-scroll, all controls
operable; axe → zero serious; reduced-motion suppresses VFX while play/seek still work.

### Tests for User Story 5 ⚠️ (write first)

- [x] T032 [P] [US5] `e2e/battle-playback.spec.ts`: **no horizontal page scroll** + slider/controls operable at **all four viewports** (320 / 360×640 portrait / 1440×900 / 2560 ultra) (SC-004, AS1) — the P7 check. Green.
- [x] T033 [P] [US5] `e2e/battle-playback.spec.ts` (axe): the playback screen scans to **zero serious/critical** violations; the scrubber exposes `role="slider"` + implicit `aria-valuenow/min/max` + `aria-valuetext` (SC-008, AS2/AS3). Green.
- [x] T034 [P] [US5] `e2e/battle-playback.spec.ts`: with `emulateMedia({ reducedMotion: 'reduce' })`, seek/jump stay functional and the contact node has ~0 transition (VFX suppressed) (SC-009, AS4); Bo3 game switch resets to that game's tick 0 (AS5). Green.

### Implementation for User Story 5

- [x] T035 [US5] `components/battle/game-selector.tsx` (GAME 1/2/3 tabs, only games present, `role="group"` + `aria-pressed`) wired to `selectGame`; switching resets to tick 0 (FR-009, AS5) — proven by the e2e game-switch test.
- [x] T036 [US5] Finalized the **responsive layout**: `BattleStage` **stacks the two sides + horizontal contact strip in portrait**, a wide two-column grid + vertical contact line in landscape (one markup, `--p`-driven node); `PlaybackControls` wrap thumb-reachably; `minmax(0,1fr)` columns — **no horizontal overflow 320px→2560px** (FR-018, SC-004), verified at all four viewports.
- [x] T037 [US5] **Event-driven VFX** on `UnitSprite` — a hit/death flash gated by `motion-safe:animate-ping` and `motion-reduce:hidden` (threaded the current tick's `events` through `BattleStage`→`ZoneColumn`); bars snap (no transition) and the DOWN state is readable from the snapshot alone (FR-007/FR-020, SC-009).
- [x] T038 [US5] Resolved the one axe finding — a `color-contrast` fail on the game-label (`text-text-dim` #5a6472 → 3.28:1) bumped to `text-text-muted`; the decorative faint labels (CONTACT LINE, empty-zone em-dash) `aria-hidden`. **Zero serious violations**; scrubber keyboard model (Arrow/Home/End/PageUp/PageDown) + Space/`K` play toggle confirmed by e2e (FR-019, SC-008).

**Checkpoint**: the player is co-equally first-class in both orientations and accessible — P7 + a11y verified.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T039 [P] **Graceful reject** path: `BattlePlayer` constructs the view in a `try/catch` and renders `BattleReject` (zero battle frames) on an unsupported `formatVersion`; `error.tsx` covers missing/failed replays (FR-003, SC-007). The reader-gate is unit-tested (`createReplayView` throws `UnsupportedFormatError`).
- [x] T040 [P] **Scale robustness** (SC-010): added a test asserting a **1-tick** battle has `lastTick 0` / `progress 0` / empty markers (no divide-by-zero) and a **1000-tick** battle projects finite, in-range frames at first/mid/last (`progress===1` exact at the end); the O(1)-seek test already proves constant-cost seek at tick 999.
- [x] T041 [P] Full SC-001…SC-010 green — **33 Vitest + 14 Playwright/axe** — with `next build` + `tsc --noEmit` + `eslint .` + the no-raw-hex guard clean. **CI gate wired**: `web-ci.yml` runs the DB-free anti-regression suites (`vitest run tests/replay-view.test.ts tests/use-playback.test.ts`) alongside the existing Playwright job.
- [x] T042 Updated `STATUS.md` (Feature 5 → built) and `CHANGELOG.md` (playback screen, O(1) scrubber, markers, both-orientation). Devlog news note **queued** — the News system (Feature 11) hasn't shipped, so it can't be posted yet (per the repo's "code push → news" convention).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → depends on Setup; **blocks all user stories** (the reader extension + player-state machine).
- **US1 (P3)** → depends on Foundational; the MVP (watch play-through).
- **US2 (P4)** → depends on Foundational + US1 (the scrubber seeks into the stage US1 renders); the headline fix. The anti-regression tests (T017/T018) gate the story.
- **US3 (P5)** → depends on US1 (extends the control cluster + loop pacing).
- **US4 (P6)** → depends on US2 (annotates the scrubber; reads the same `events`).
- **US5 (P7)** → depends on US1–US4 existing (it hardens/audits them across orientations).
- **Polish (P8)** → depends on all desired stories.

### Within a story

Tests (unit/anti-regression/Playwright) first → reader/view helpers → components → wiring.
Commit after each task or logical group (Principle IX).

### Parallel opportunities

- Setup: T002–T004 in parallel.
- Foundational: T005→T006 sequential (same file); T007 parallel after T005; T008 parallel (different file).
- US1 tests T009–T011 in parallel; then T012/T013 parallel, T014/T015 build on them, T016 integrates.
- US2 tests T017–T020 all `[P]`; then T021→T022.
- US3 tests T023–T025 `[P]`; US4 tests T028–T029 `[P]`; US5 tests T032–T034 `[P]`.

---

## Implementation Strategy

### MVP first (US1 → US2)

Setup → Foundational → **US1** (watch a replay play through) → **US2** (the working scrubber,
with T017/T018 proving O(1) seek + engine-never-called). At that point the previously-broken
viewer is *fixed and demonstrable* — the shippable core.

### Incremental delivery

US1 (watch) → US2 (scrub/seek) → US3 (speed/step/jump) → US4 (markers) → US5 (both-orientation
+ a11y + reduced-motion hardening). Each adds value without breaking prior stories; the feature
is "done" when SC-001…SC-010 are green and `next build`/typecheck/lint pass.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- **P6 is the spine**: no playback module may import `@wfc/engine-wasm` or simulate; **seek is
  an array index, never a re-run**. T017 (O(1)) + T018 (engine-never-called) are the
  anti-regression contract for the previous game's broken scrubber — never weaken them to make a
  test pass.
- **P7 is the co-headline**: any stage/controls/scrubber change must preserve
  no-overflow + operability at **both** 360px *and* 1440px (SC-004) — verify both, never one.
- **Token-only**: no raw brand hex; compose Feature 3 primitives/tokens (Feature 3 SC-002).
- The renderer is **DOM/CSS** (research A1); the `BattleStage(view, progress)` seam keeps a
  Canvas escape hatch available without touching seek/loop logic — but do not build it (YAGNI).
