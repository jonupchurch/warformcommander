# Feature Specification: Battle Playback

**Feature Branch**: `005-battle-playback`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Battle Playback — the pixel-art battle-viewer screen that renders a stored Replay (Feature 1) as a watchable battle across the four zones per side, with a **working scrubber** + playback controls (play/pause, seek to any tick, speed) 'like in the wireframes'. The client is a replay-only player: it renders the tick stream and **never re-simulates** — the scrubber seeks any tick by O(1) indexing. This is the fix for a previous game whose replay viewer was broken because its format forced re-simulation to seek."

## Overview

This feature is the **battle-playback UI** — the screen a player watches after a match
resolves. It renders the **tick-indexed Replay** that Feature 1's engine emits
([`../001-battle-sim-core/contracts/replay-format.md`](../001-battle-sim-core/contracts/replay-format.md))
as a pixel-art battle across the four zones per side, with the playback controls the
[Battle Playback mockup](../../reference/Warform%20Commander%20Battle%20Playback.dc.html)
draws: **play / pause, a working scrubber that seeks any tick, variable speed, frame-step,
jump-to-start/end, and event markers on the timeline.**

It is the **render layer over a pure data reader.** Feature 1 already solved the hard
problem — the replay is a **random-access, tick-indexed JSON** stream
(`snapshots[tick]` / `events[tick]`) with a pure TS reader
(`src/sim/replay-reader.ts`) whose whole purpose is O(1) seek with **zero
re-simulation**. This feature sits on that reader and draws it. It **imports nothing from
the engine** (`@wfc/engine-wasm`) and runs no simulation of any kind (constitution
**[P6](../../.specify/memory/constitution.md)** — the client never simulates and never
fabricates; it only replays).

**Why this feature exists — the load-bearing requirement.** A previous, similar game the
team built shipped a **broken replay viewer**: its scrubber didn't work because the format
was an event/delta stream that required *re-simulating from the start* to reach an arbitrary
tick — so seeking was slow, janky, and eventually abandoned. Feature 1's replay format was
designed specifically to make that impossible to repeat (full per-tick snapshots, not
deltas; array-indexed seek). **This feature is where that fix becomes visible to the
player: a scrubber that seeks *any* tick instantly, mid-playback, at both a 360px phone and
a 1440px monitor, and never touches the engine.** Getting the scrubber right is the top
priority.

The value it delivers: **a battle you can actually watch and *scrub* — the plan executing,
the Plan-B beats landing, the counter-web resolving — reproducibly, on both platforms, from
data alone.**

## User Scenarios & Testing *(mandatory)*

The "user" is a **player** watching a match they (or someone on the ladder) just fought.
Stories are prioritized so implementing **US1 alone yields a watchable replay**, and
**US1 + US2 together** deliver the headline fix (the working scrubber). Every story is
independently testable against a fixture Replay — **no engine, no network, no
re-simulation** is ever required to test playback.

### User Story 1 - Watch a stored replay from start to finish (Priority: P1) 🎯 MVP

A player opens a resolved match and watches it play out: they press **Play** and the battle
advances tick by tick at real speed (10 ticks/sec) across the four zones per side — units
show hull/shield bars depleting, faction tint (friendly cyan / enemy red), and per-tick VFX
(firing, hits, deaths) — the overall stat bar and tick readout update live, and playback
**stops cleanly at the final tick**. Pressing **Pause** freezes the current tick; pressing
**Play** again resumes.

**Why this priority**: This is the feature's reason to exist — a watchable battle. Without
it there is nothing to scrub, speed up, or mark. It is the MVP: even alone, a player can
watch any stored replay play through, which is a complete, demonstrable slice. It also
proves the core invariant — the play loop advances an **integer tick and indexes the
reader**, never calling the engine (P6).

**Independent Test**: Load a fixture Replay into the player, press Play, and assert the
rendered battle advances from tick 0 to the final tick at ~10 ticks/sec, that per-unit
hull/zone at each rendered tick equals `reader.snapshotAt(tick)`, that playback halts at the
last tick, and that **the engine module (`@wfc/engine-wasm`) is never imported or invoked**
during the entire play-through.

**Acceptance Scenarios**:

1. **Given** a stored Replay, **When** the player presses Play, **Then** the battle advances one tick every ~100 ms (10 t/s) and each unit renders at the hull/shield/zone/alive state that `reader.snapshotAt(currentTick)` reports.
2. **Given** a battle playing, **When** it reaches the final tick of the game, **Then** playback stops on that tick (does not loop or overrun) and the controls show a paused/ended state.
3. **Given** a battle playing, **When** the player presses Pause, **Then** the battle freezes on the current tick and no further ticks advance until Play is pressed again.
4. **Given** any tick during playback, **When** an `events[tick]` entry contains a `death`, **Then** the dying unit renders its death state (dimmed + "DOWN") from that tick onward, matching the mockup's `op:0.3` / "DOWN" treatment.
5. **Given** the player is watching, **When** the whole play-through runs, **Then** no call is ever made into the simulation engine — the frame is produced purely by indexing the decoded replay (P6).

---

### User Story 2 - Scrub and seek to any tick — the working scrubber (Priority: P1)

A player drags the scrubber (or clicks anywhere on the timeline, or uses the arrow keys) and
the battle **jumps instantly to that tick** — mid-playback or while paused — showing the
exact battlefield state at the target tick. Seeking backward to tick 0, forward to the last
tick, or to any tick in between is **immediate and never re-simulates**: the target frame is
one array index into the decoded replay (`snapshots[targetTick]`), so seeking the last tick
of a 1000-tick battle costs the same as seeking tick 1.

**Why this priority**: **This is the fix.** The previous game's broken scrubber is the
explicitly-named failure this whole feature (and Feature 1's replay format) was designed to
prevent. Co-equal **P1** with US1 because a replay you can watch but not seek is exactly the
half-working viewer we are replacing. The O(1)-seek-with-zero-re-simulation guarantee is the
load-bearing requirement of the spec (**[SC-002](#measurable-outcomes)**,
**[SC-005](#measurable-outcomes)**).

**Independent Test**: Render the player on a fixture Replay; drive the scrubber to a random
sequence of ticks (0, last, mid-battle, mid-death) while paused *and* while playing; assert
each seek renders the state equal to `reader.snapshotAt(targetTick)` within one animation
frame, that **no engine call occurs**, and that a seek to the last tick touches the **same
number of snapshot-array reads** as a seek to tick 1 (O(1), not O(tick)).

**Acceptance Scenarios**:

1. **Given** a paused battle at tick 0, **When** the player drags the scrubber to tick 850, **Then** the battlefield renders the exact state of `snapshots[850]` immediately (within one frame), with no intervening ticks simulated or replayed.
2. **Given** a battle playing at tick 200, **When** the player scrubs back to tick 40, **Then** playback continues (or pauses, per the defined seek-during-play behavior) from tick 40 forward, showing tick 40's state exactly.
3. **Given** a 1000-tick replay, **When** the player seeks to the last tick and separately to tick 1, **Then** both seeks complete in constant time (the same bounded number of array accesses) with no dependence on the target tick's magnitude.
4. **Given** the scrubber is focused, **When** the player presses ◄ / ► (Left/Right arrow), **Then** the current tick decrements/increments by one and the frame updates; **Home** jumps to tick 0, **End** to the last tick.
5. **Given** any seek, **When** it resolves, **Then** the simulation engine is never invoked — seeking is a pure array index, not a re-run (P6, the anti-regression for the previous game's bug).

---

### User Story 3 - Control the pace: speed, frame-step, jump (Priority: P2)

A player tunes how they watch: a **speed control** (0.5× / 1× / 2×) changes how fast
playback advances ticks; **frame-step** buttons (◄◄ / ►►) nudge the battle a fixed number of
ticks back/forward while paused (for frame-by-frame inspection); and **jump-to-start** /
**jump-to-end** (and a **Skip to Outcome** affordance) move directly to the first/last tick.

**Why this priority**: These make playback *usable* for analysis (slow down a decisive
exchange, step through a Plan-B trigger, skip to the result) and match the mockup's control
cluster (◄◄ / play / ►► + scrubber + the "Skip to Outcome →" button). **P2** because they
layer on the play loop (US1) and the seek primitive (US2) rather than introducing new
foundations.

**Independent Test**: With a fixture Replay, set speed to each of 0.5× / 1× / 2× and assert
the play loop advances ticks at 5 / 10 / 20 ticks/sec (±1 tick/s tolerance); press
frame-step and assert the tick moves by exactly the step and pauses; press jump-to-end and
assert the current tick is the last tick.

**Acceptance Scenarios**:

1. **Given** playback at 1× (10 t/s), **When** the player selects 2×, **Then** ticks advance at ~20 t/s; selecting 0.5× advances at ~5 t/s; the current tick and rendered state stay consistent with `reader.snapshotAt(currentTick)` at every speed.
2. **Given** a paused battle, **When** the player presses frame-step forward, **Then** the current tick advances by the defined step (e.g. 3 ticks, per the mockup) without starting continuous playback, clamped to the last tick.
3. **Given** a battle at any tick, **When** the player presses jump-to-start, **Then** the current tick becomes 0; **When** jump-to-end (or "Skip to Outcome"), **Then** the current tick becomes the last tick (and "Skip to Outcome" additionally routes to the Battle Summary — Feature 6 — when present).
4. **Given** a speed change during playback, **When** it is applied, **Then** playback does not skip or drop ticks — the same tick sequence is shown, only paced faster/slower.

---

### User Story 4 - Read the story: event markers on the timeline (Priority: P2)

The scrubber's timeline is annotated with **event markers** at the ticks where meaningful
things happened — **Plan-B triggers** ("Plan B triggered!" beats) and **deaths** — so the
player can see the battle's shape at a glance and **jump straight to a marker**. Hovering /
focusing a marker labels it (which unit, which event); the contact-line progress node and
tick readout keep the player oriented.

**Why this priority**: The design doc calls out that "conditional switches create narrative
beats ('Plan B triggered!')" (§9) — surfacing those on the timeline turns a raw tick stream
into a readable story and is what makes scrubbing *purposeful*. **P2** because it enriches
the scrubber (US2) and reads the same `events[tick]` the render already consumes; it is not
required to watch or seek.

**Independent Test**: Load a fixture Replay with known `planb` and `death` events; assert a
marker renders at each such tick at the correct proportional position on the timeline, that a
marker's accessible label names the event/unit, and that activating a marker seeks to its
tick.

**Acceptance Scenarios**:

1. **Given** a Replay whose `events` contain Plan-B triggers and deaths, **When** the timeline renders, **Then** a marker appears at each such tick, positioned at `tick / lastTick` along the track, tinted by kind (Plan-B vs death) and side (friendly/enemy).
2. **Given** an event marker, **When** the player activates it (click/Enter), **Then** the battle seeks to that marker's tick.
3. **Given** a marker, **When** it is hovered or keyboard-focused, **Then** an accessible label identifies the event and the unit involved.
4. **Given** a replay with hundreds of events, **When** markers are computed, **Then** they are derived **once** on load (a single pass over `events`) and reused — not recomputed per frame or per seek.

---

### User Story 5 - First-class in both orientations, accessible, motion-safe (Priority: P3)

The whole playback surface is **co-equally first-class in mobile portrait and desktop
landscape** (constitution **P7**): the battlefield, controls, and scrubber all work and feel
native at 360px portrait and 1440px landscape, with no horizontal overflow. The controls are
a **keyboard- and screen-reader-operable media player** (the scrubber follows the WAI-ARIA
media-seek-slider pattern), and a **`prefers-reduced-motion`** path suppresses the
decorative VFX (muzzle flashes, hit shakes, glows) while keeping playback and seeking fully
usable — motion never carries information on its own.

**Why this priority**: P7 is never-waived and accessibility is a "verify before done"
obligation (Principle V/VIII) — both are cheapest baked into this feature rather than
retrofitted. **P3** because it hardens US1–US4 (much of it is expressed as acceptance
criteria on them) rather than adding new playback surface, but it is called out as its own
independently-verifiable slice.

**Independent Test**: Drive the player with Playwright at 360×640 (portrait) and 1440×900
(landscape) plus 320px min; assert no horizontal scroll, the controls and scrubber are
reachable and operable by keyboard, the scrubber exposes `role="slider"` with
`aria-valuenow/min/max/valuetext`; run an axe audit for zero serious violations; enable
`prefers-reduced-motion` and assert VFX animations are suppressed while play/pause/seek still
work.

**Acceptance Scenarios**:

1. **Given** a 360px-wide portrait viewport, **When** the player renders, **Then** the two-side battlefield, controls, and scrubber lay out without horizontal page scroll and every control is reachable within thumb range; **Given** a 1440px landscape viewport, the same content renders in the mockup's wide two-column battlefield.
2. **Given** a keyboard-only user, **When** they tab to the controls, **Then** play/pause, speed, frame-step, and the scrubber are all reachable and operable, with visible focus; the scrubber responds to Arrow/Home/End/PageUp/PageDown.
3. **Given** a screen reader, **When** it reaches the scrubber, **Then** it announces a slider with the current tick and a human-readable position (`aria-valuetext`, e.g. "tick 412 of 1000, 41.2 seconds") per the WAI-ARIA media-seek pattern.
4. **Given** `prefers-reduced-motion: reduce`, **When** the battle plays, **Then** decorative VFX (flashes, shakes, glows) are suppressed and bar/position changes snap without transition, while play/pause/seek and the state readouts remain fully functional and information-complete.
5. **Given** either orientation, **When** the Bo3 game selector is used, **Then** switching GAME 1/2/3 resets to that game's tick 0 and plays/seeks that game's tick stream.

---

### Edge Cases

- **Seek to tick 0 / to the last tick / mid-death**: each renders the exact snapshot at that tick; seeking onto the tick a unit dies shows it alive-through-that-tick or dead per the snapshot's `aliveFlag` at that exact tick (deterministic, snapshot-defined — the client never interpolates a death).
- **Unsupported `formatVersion`**: a Replay whose `formatVersion` is outside the reader's supported range is **rejected gracefully** — a clear "replay can't be played (unsupported format)" state, **never a partial or mis-rendered battle** (the reader gates before any render; regeneration is the server's job, Feature 7).
- **Very short battle** (e.g. a 12-tick Conquest): the scrubber, markers, and play loop all work with a tiny tick range; the track and markers scale to `lastTick` without divide-by-zero.
- **Maximum-length battle** (the 1000-tick cap × 10 units): loads, plays, and scrubs smoothly; seeking any tick stays O(1); no per-tick render jank (the decoded replay is tens-to-low-hundreds of KB — see the replay-format research).
- **Empty / no-event timeline**: a battle with no Plan-B triggers and no deaths before Time (e.g. a support-only stalemate) renders a marker-free timeline and still plays/seeks normally.
- **Both sides lose their last unit on the same tick** (simultaneous lethal): the snapshot at that tick is authoritative; the view renders exactly what the snapshot says (the engine already decided the winner — the client does not adjudicate).
- **Seeking while playing**: a mid-playback seek is well-defined (jump to the target tick and continue from there, or pause-on-scrub-then-resume — the chosen behavior is fixed and tested), never a race that double-advances or desyncs the readout from the frame.
- **Reduced motion + fast speed**: at 2× with reduced motion, ticks still advance correctly; only the decorative transitions are removed.
- **A game with fewer than 3 entries in the Bo3** (a 2-0 match has 2 games): the game selector shows only the games that exist; selecting a non-existent game is impossible.
- **Rapid scrub thrash** (dragging the scrubber back and forth quickly): each pointer position resolves to one O(1) index; the render coalesces to the latest target tick (no queue backlog, no re-sim per intermediate value).
- **Replay missing or fetch failed** (upstream): the page shows a graceful "replay unavailable" state rather than an empty battlefield (the fetch itself is Feature 7; this feature handles the absent/rejected input).

## Requirements *(mandatory)*

### Functional Requirements

**Replay consumption — pure player, never the engine (P6)**

- **FR-001**: The system MUST render playback **exclusively** from the decoded Replay via Feature 1's pure reader (`src/sim/replay-reader.ts`), obtaining any tick's state by **O(1) index** (`snapshots[tick]`) — and MUST NOT import, instantiate, or call the simulation engine (`@wfc/engine-wasm`) or perform any simulation, re-simulation, or fabrication of battle state (constitution **P6**; the anti-regression for the previous game's broken viewer).
- **FR-002**: The system MUST decode/parse the Replay **once** on load (delegated to the reader) and thereafter seek by indexing the in-memory structure — never re-parsing or reconstructing prior ticks to reach a target tick.
- **FR-003**: The system MUST gate on the Replay's **`formatVersion`** via the reader's supported-range check and, when a replay is unsupported, present a clear rejection state **without** rendering a partial/mis-rendered battle (regeneration is the server's responsibility per [`../007-accounts-persistence/contracts/persistence-api.md`](../007-accounts-persistence/contracts/persistence-api.md)).
- **FR-004**: The system MUST read per-unit identity and placement from the replay's **`unitOrder`** dictionary and each snapshot row (`[hull, shield, zoneIdx, aliveFlag]`, with `zoneIdx` 0=Air/1=Front/2=Middle/3=Rear), and MUST NOT hardcode unit rosters or positions.

**Battle view — the pixel-art battlefield (§4, the mockup, Feature 3 design system)**

- **FR-005**: The system MUST render the battlefield as **two mirrored sides** across a central contact line, each side laid out as **Air (its own row) + the three ground zones (Front / Middle / Rear)**, with the player's Front and the enemy's Front nearest the contact line (collapsing-forward order, §4), matching the [Battle Playback mockup](../../reference/Warform%20Commander%20Battle%20Playback.dc.html).
- **FR-006**: The system MUST render each unit at its current-tick state: its **`UnitIcon`** ([`../003-app-shell/contracts/components.md`](../003-app-shell/contracts/components.md)) tinted by faction (friendly `--color-faction-friendly` / enemy `--color-faction-enemy`), a **hull bar** and (where present) a **shield bar** proportional to that unit's start-of-game maximum, a numeric readout, and a **dead treatment** (dimmed + "DOWN") when `aliveFlag` is 0 — all styled from Feature 3 semantic tokens, **no raw hex**.
- **FR-007**: The system MUST drive **per-tick VFX** from `events[tick]` — at minimum firing (`shot`), impact (`hit`), and death (`death`) cues, and MAY surface `move`, `planb`, and `support` cues — as short, decorative animations that convey the beat without being required to understand the battle state (state is always readable from the snapshot alone).
- **FR-008**: The system MUST render the **overall stat readout** per the mockup — per side: units alive (`n/5`), summed current hull, and cumulative damage dealt — derived from the current-tick snapshot (and the tick-0 baseline for maxima), plus the **tick / time readout** (`NNN / total` and `tick/10` seconds) and a **contact-line progress indicator** positioned at `currentTick / lastTick`.
- **FR-009**: The system MUST support **Bo3 game selection** (GAME 1 / 2 / 3), rendering only the games present in the Replay's `games[]`; selecting a game resets to that game's tick 0 and plays/seeks that game's tick stream.

**Playback controls & the scrubber (the headline)**

- **FR-010**: The system MUST provide **play / pause**: Play advances the current tick over time at the current speed; Pause freezes the current tick; playback **halts at the last tick** of the selected game (no loop/overrun) and reflects an ended state.
- **FR-011**: The system MUST provide a **scrubber** that seeks to **any tick** in the selected game — by pointer drag, click-on-track, and keyboard — where each seek is an **O(1) index** to `snapshots[targetTick]` that renders within one animation frame and **never re-simulates** (the load-bearing requirement; **SC-002**/**SC-005**).
- **FR-012**: The scrubber MUST support **seeking mid-playback** with a single, fixed, well-defined behavior (jump to the target tick and continue, or pause-on-scrub-then-resume) that keeps the tick readout and the rendered frame in sync (no desync, no double-advance).
- **FR-013**: The system MUST provide **variable speed** (at least 0.5× / 1× / 2×), advancing ticks at `10 × speed` ticks/sec, without skipping or dropping ticks in the shown sequence.
- **FR-014**: The system MUST provide **frame-step** (fixed-step back/forward while paused, clamped to `[0, lastTick]`) and **jump-to-start / jump-to-end**, plus a **Skip to Outcome** affordance that moves to the last tick and (when Feature 6 exists) routes to the Battle Summary.
- **FR-015**: The system MUST render **event markers** on the timeline for **Plan-B triggers and deaths**, positioned at `tick / lastTick`, tinted by kind and side, each **activatable to seek to its tick** and carrying an accessible label; markers MUST be derived **once** on load from a single pass over `events` and reused (not recomputed per frame/seek).

**Player state (client-only, ephemeral)**

- **FR-016**: The system MUST model playback as an explicit **player state machine** — at minimum `{ gameIndex, currentTick, isPlaying, speed }` — advanced by a single `requestAnimationFrame`-driven loop that maps elapsed wall-clock time to an **integer tick** at the current speed; the loop MUST only advance the tick and index the reader (it MUST NOT call the engine), and MUST be paused/cleaned up on unmount and when not playing.
- **FR-017**: The system MUST keep the **rendered frame a pure function of `(gameIndex, currentTick)`** over the immutable decoded Replay — so a given tick always renders identically, seeking and playing produce the same frame for the same tick, and React re-renders are driven by tick changes (≤ ~20/sec at 2×), with any per-frame visual smoothing handled by CSS transitions rather than additional React state churn.

**Responsiveness, accessibility, motion (P7, Principle VIII)**

- **FR-018**: The playback surface MUST be **first-class in both mobile portrait and desktop landscape** (P7) — rendering with **no horizontal page scroll** from 320px through ultra-wide, and with a portrait layout designed *for* portrait (not a squeezed landscape), inside the Feature 3 app shell.
- **FR-019**: The controls MUST be a **keyboard- and screen-reader-operable media player**: all controls reachable/operable by keyboard with visible focus; the scrubber implemented per the **WAI-ARIA media-seek-slider** pattern (`role="slider"`, `aria-valuenow/min/max`, human-readable `aria-valuetext`, Arrow/Home/End/PageUp/PageDown).
- **FR-020**: The system MUST honor **`prefers-reduced-motion`**, suppressing decorative VFX and position/bar transitions while keeping playback, seeking, and all state readouts fully functional and information-complete (no information conveyed by motion alone) — reusing the Feature 3 reduced-motion baseline.

**Scope boundary (Principle IV)**

- **FR-021**: This feature MUST NOT implement the simulation engine (Feature 1), replay **storage/fetching** (Feature 7 — this feature *consumes* a fetched Replay), the **post-battle summary** screen (Feature 6 — it links to it), matchmaking or the Bo3 run loop (Feature 8), the Garage/army builder (Feature 4), or the design system/shell itself (Feature 3 — it *composes* it). It provides only the playback screen and its controls over an already-fetched Replay.

### Key Entities *(include if feature involves data)*

- **PlayerState** *(client-only, ephemeral)*: the playback state machine — `gameIndex`, `currentTick`, `isPlaying`, `speed` (and derived UI flags like `atEnd`). Never persisted; reset per game; the single source of truth the view renders from.
- **BattleViewModel / ZoneBucket** *(derived, per tick)*: the render-ready projection of `reader.snapshotAt(gameIndex, currentTick)` — units bucketed by side × zone (Air + Front/Middle/Rear), each with `unitType`, faction, `hullPct`/`shieldPct` (against the tick-0 baseline), numeric hull, and `alive` — mirroring the mockup's `bucket()`/`view()`.
- **TimelineMarker** *(derived once on load)*: `{ tick, kind: 'planb' | 'death', side, unitInstanceId, label }` — computed from a single pass over the selected game's `events`, positioned at `tick / lastTick`, used to annotate the scrubber and to seek.
- **Replay / GameReplay / MachineSnapshot row / TickEvent / unitOrder** *(consumed, owned by Feature 1)*: the tick-indexed data this feature renders — **reused, not redefined**; the authoritative shapes live in [`../001-battle-sim-core/contracts/replay-format.md`](../001-battle-sim-core/contracts/replay-format.md) and [`../001-battle-sim-core/data-model.md`](../001-battle-sim-core/data-model.md). The snapshot row is `[hull, shield, zoneIdx, aliveFlag]` in `unitOrder` order.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Faithful playback** — for a fixture Replay, the rendered per-unit hull/shield/zone/alive state at **every** tick during a full play-through equals `reader.snapshotAt(tick)` with zero discrepancy (100% frame-accuracy against the reader).
- **SC-002**: **Instant seek** — seeking to **any** tick (0, last, or arbitrary) renders the target frame in **< 16 ms** (within one animation frame) on the reference viewport, with **no re-simulation** — verified across a randomized seek battery on a 1000-tick fixture.
- **SC-003**: **O(1) seek, not O(tick)** — the number of snapshot-array reads for a seek to the last tick of a 1000-tick replay equals (within a constant) the reads for a seek to tick 1; seek cost does **not** grow with target-tick magnitude (the previous game's bug, provably absent).
- **SC-004**: **Both orientations first-class (P7)** — the full playback surface renders with **zero horizontal page scroll** and all controls + the scrubber reachable/operable at **360×640 (portrait)** and **1440×900 (landscape)**, and at 320px min — verified by automated viewport tests.
- **SC-005**: **Playback never simulates (P6)** — across a full session (load → play → pause → scrub a randomized battery → speed changes → game switch), the simulation engine (`@wfc/engine-wasm`) is imported/invoked **zero** times — verified by an automated import-graph/spy assertion (the anti-regression test).
- **SC-006**: **Speed accuracy** — at 0.5× / 1× / 2×, playback advances ticks at 5 / 10 / 20 ticks per second within ±1 tick/sec over a measured interval, showing the same tick sequence at every speed.
- **SC-007**: **Graceful format rejection** — a Replay with an unsupported `formatVersion` yields a clear rejection state and **zero** rendered battle frames (no partial/mis-rendered battlefield) — verified with an out-of-range fixture.
- **SC-008**: **Accessibility** — an automated audit (axe) on the playback screen reports **zero serious/critical** violations; every control is keyboard-operable with visible focus; the scrubber exposes `role="slider"` with `aria-valuenow/min/max` and a human-readable `aria-valuetext` per the WAI-ARIA media-seek pattern.
- **SC-009**: **Reduced motion** — with `prefers-reduced-motion: reduce`, all decorative VFX/transition animations are suppressed while play/pause/seek and all state readouts remain fully functional — verified by test.
- **SC-010**: **Scale robustness** — both a very short (≤ ~15-tick) fixture and a full 1000-tick fixture load, play through, and are fully scrubbable with markers, with no divide-by-zero on the tiny range and no per-tick render jank on the large one.

## Assumptions

- **Input is an already-fetched Replay.** The page receives a **stored Replay** (Feature 1's typed shape) fetched server-side via Feature 7's `getReplay(ctx, matchId)` ([`../007-accounts-persistence/contracts/persistence-api.md`](../007-accounts-persistence/contracts/persistence-api.md)); this feature does not design storage, fetching, auth, or regeneration — it renders whatever valid Replay it is handed and rejects an unsupported one gracefully.
- **The reader is the seek primitive.** Feature 1 ships `src/sim/replay-reader.ts` (pure TS, O(1) tick indexing, `formatVersion` gate). This feature **builds on it and extends it only as needed** for the view (e.g. a `snapshotAt`/`eventsAt` convenience and a `unitMaxHull` baseline), never adding simulation.
- **Max-HP baseline = the tick-0 snapshot.** To render a hull/shield bar as a percentage, the per-unit maximum is taken from **`snapshots[0]`** (start-of-game full state) rather than re-deriving effective stats on the client — this keeps the client a pure player (P6) and needs no engine/army-derivation import. *(Judgment call — recorded here per Principle I/VI.)*
- **Rendering approach = DOM/CSS sprites, not Canvas/WebGL/PixiJS.** Because positions are **discrete zones** (not free 2D movement), the battle is **≤10 units across 4 zones**, VFX are **event-driven**, and the view must be **responsive and accessible in both orientations**, the mockup's DOM/flex/grid layout (reusing Feature 3's `UnitIcon`, tokens, and responsive primitives) is the right, not-over-engineered choice — zero added bundle, free responsiveness/accessibility, pixel-art crispness via `image-rendering: pixelated` where raster VFX are used. A Canvas 2D / `@pixi/react` layer is the **documented escape hatch** if profiling ever shows DOM churn is a bottleneck (it won't at 10 units). *(Rationale in [research.md](./research.md); judgment call recorded per Principle VI.)*
- **Interpolation is limited by design.** With discrete zone positions there is no free motion to interpolate between ticks; visual smoothing is **CSS transitions** on hull/shield bars and zone-transition slides (gated by reduced motion), while the **seekable unit of truth is always the integer tick** — the play loop's fractional accumulator only paces tick advance, it never invents sub-tick battle state.
- **Seek-during-play behavior is fixed and tested** (jump-and-continue vs pause-on-scrub) — chosen in the plan/research, not left ambiguous, so US2-AS2 is deterministic.
- **Stack**: Next.js 16 App Router + React 19 + Tailwind v4 + the Feature 3 design system, deployed on Vercel; the battle view is **client-side rendered** (the Replay is data passed from a Server Component that fetched it). The route lives inside the Feature 3 authenticated app shell (`app/(app)/…`) and resolves a sensible active top-level nav destination (Arena/Ladder) — the shell owns that resolution (Feature 3).
- **Tick model is Feature 1's** — 10 ticks/sec, hard cap 1000 ticks; a battle is ≤1000 ticks × 10 units across 4 zones; position is the discrete zone (`zoneIdx`), not x/y. These are fixed inputs this feature renders, not values it defines.
- **The mockup is the visual source of truth** for the layout, control cluster, stat readouts, contact-line node, and game tabs; where a mockup detail (e.g. exact frame-step size, the mock's 70 ms interval) conflicts with the real tick model, the **real 10 t/s model and Feature 3 tokens win** (Principle III).
