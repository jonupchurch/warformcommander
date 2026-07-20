# Data Model: Battle Playback

**Feature**: `005-battle-playback` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

The "data" of this feature is **not persisted game data** — it is the **client-only,
ephemeral playback state** plus the **derived, per-tick render projections** of an
already-decoded Replay. The authoritative game-data shapes it renders (`Replay`,
`GameReplay`, the snapshot row, `TickEvent`, `unitOrder`) are **owned by Feature 1 and
reused, not redefined** — their single source of truth is
[`../001-battle-sim-core/data-model.md`](../001-battle-sim-core/data-model.md) and
[`../001-battle-sim-core/contracts/replay-format.md`](../001-battle-sim-core/contracts/replay-format.md).

Two hard rules shape everything below (constitution
**[P6](../../.specify/memory/constitution.md)**):

1. **Nothing here is authored or persisted.** PlayerState is transient UI state; the derived
   models are pure functions of `(gameIndex, currentTick)` over the immutable decoded Replay.
2. **Nothing here is simulated.** Every value is obtained by **indexing** the decoded replay
   through Feature 1's pure reader — never by running or re-running the engine.

---

## Layering — three tiers

| Tier | What | Owner |
|---|---|---|
| **1. Consumed (immutable input)** | `Replay` / `GameReplay` / snapshot row / `TickEvent` / `unitOrder` / `formatVersion` | **Feature 1** (reused) |
| **2. Player state (ephemeral, client-only)** | `PlayerState` + its reducer actions | **this feature** |
| **3. Derived render projections** | `BattleViewModel` / `ZoneBucket` / `UnitView` / `OverallStats` / `TimelineMarker` | **this feature** (pure functions of Tier 1 + `currentTick`) |

---

## Tier 1 — Consumed types (Feature 1; reused, not redefined)

Referenced here only to fix the exact fields this feature reads. **Do not redefine these** —
import the shapes from Feature 1's contract/TS mirror.

### Replay / GameReplay (read-only)

Per [replay-format.md](../001-battle-sim-core/contracts/replay-format.md):

- `formatVersion: number` — gated by the reader; unsupported → graceful reject (FR-003).
- `meta.unitOrder: UnitDescriptor[]` — the column dictionary: `{ side, instanceId, typeId, variantId }` per unit, stable order. Drives which snapshot column is which unit.
- `meta.tickRate` (10), `meta.tickCap` (1000), `meta.matchConfig` (`bestOf`, `defenderSide`).
- `games[gameIndex]`:
  - `gameResult: { winner, condition, rewardTier, durationTicks }`.
  - `snapshots: SnapshotRow[]` — **`snapshots[tick]` is O(1)**; row order === `unitOrder`.
  - `events: TickEvent[][]` — `events[tick]` is the (small) event array for that tick.

### SnapshotRow (read-only) — positional

`[hull, shield, zoneIdx, aliveFlag]` per unit, in `unitOrder` order:

| Field | Meaning (read) |
|---|---|
| `hull` | current hull, fixed-point integer at ruleset scale; **client divides for display** (reader helper). |
| `shield` | current shield, same scale. |
| `zoneIdx` | `0=Air, 1=Front, 2=Middle, 3=Rear`. |
| `aliveFlag` | `1 | 0` — drives the dead treatment (dimmed + "DOWN"). |

### TickEvent (read-only)

Per [replay-format.md](../001-battle-sim-core/contracts/replay-format.md) — `t` (kind) ∈
`shot | hit | miss | damage | death | move | planb | support`, with `a` (actor index into
`unitOrder`), optional `d` (target index), and compact magnitudes. This feature reads:

- `shot` / `hit` / `death` → per-unit **VFX** (FR-007).
- `move` → zone-transition slide (optional VFX).
- `death` / `planb` → **timeline markers** (Tier 3, FR-015).

---

## Tier 2 — PlayerState (ephemeral, client-only)

The playback state machine — the single source of truth the view renders from. **Never
persisted; reset per game.**

| Field | Type | Notes |
|---|---|---|
| `gameIndex` | `number` (0..games.length-1) | which Bo3 game is selected; clamped to games present. |
| `currentTick` | `number` (0..lastTick) | the integer tick being rendered; the **seekable unit of truth**. |
| `isPlaying` | `boolean` | whether the rAF loop is advancing ticks. |
| `speed` | `0.5 \| 1 \| 2` | playback rate multiplier; tick advance = `10 × speed` t/s. |

**Derived (not stored):**

- `lastTick(gameIndex) = games[gameIndex].snapshots.length - 1`.
- `atEnd = currentTick >= lastTick`.
- `timeSeconds = currentTick / tickRate` (tickRate = 10).

> **Invariant (FR-017):** the rendered frame is a **pure function of `(gameIndex,
> currentTick)`** over the immutable decoded Replay. Seeking and playing to the same tick
> render identically. `isPlaying`/`speed` affect only *pacing*, never the frame's content.

### Reducer actions (the state machine)

Modeled as a `useReducer` (see [contracts/battle-view.md](./contracts/battle-view.md)):

| Action | Effect | Guarantees |
|---|---|---|
| `play` | `isPlaying = true`; if `atEnd`, first reset `currentTick = 0` | starts the rAF loop (loop lives in a ref, started by an effect). |
| `pause` | `isPlaying = false` | stops the loop; freezes `currentTick`. |
| `tick` | `currentTick = min(currentTick + 1, lastTick)`; if it reaches `lastTick`, `isPlaying = false` | **the only mutation the rAF loop dispatches**; halts at last tick (FR-010). |
| `seek(t)` | `currentTick = clamp(t, 0, lastTick)` | **O(1)** — one clamp + a render that indexes `snapshots[t]`; **no engine call, no fast-forward** (FR-011, SC-003/SC-005). |
| `step(n)` | `pause` then `seek(currentTick + n)` | frame-step while paused, clamped (FR-014). |
| `setSpeed(s)` | `speed = s` | re-paces the loop without skipping ticks (FR-013). |
| `selectGame(g)` | `gameIndex = g`, `currentTick = 0`, `isPlaying = false` | resets to that game's tick 0 (FR-009). |

**State-machine notes** (research B1/B3/B5):

- The **rAF loop** is not part of the reducer — it lives in a `useRef`, is started/stopped by
  an effect keyed on `isPlaying`/`speed`/`gameIndex`, and only ever dispatches `tick`. It maps
  elapsed wall-clock time to integer ticks via a **100/speed-ms accumulator** and is cleaned up
  on pause/unmount.
- **Seek-during-play** is jump-and-continue (playing) / jump-and-stay (paused); the loop's
  accumulator/`last` reset on seek so pacing resumes cleanly (research B5).

---

## Tier 3 — Derived render projections (pure functions of Tier 1 + `currentTick`)

All computed per render from the decoded Replay + `currentTick`. None are stored; all are
memoizable. These mirror the [Battle Playback mockup](../../reference/Warform%20Commander%20Battle%20Playback.dc.html)'s
`view()` / `bucket()` helpers.

### UnitView — one unit at the current tick

| Field | Derivation |
|---|---|
| `instanceId`, `typeId`, `side` | from `unitOrder[column]`. |
| `unitIconType` | map `typeId` → `MachineTypeKey` for `UnitIcon` (Feature 3 map). |
| `faction` | `side === playerSide ? 'friendly' : 'enemy'`. |
| `hull`, `shield` | `snapshots[currentTick][column]` (reader divides fixed-point for display). |
| `hullPct` / `shieldPct` | `hull / unitMaxHull(column)` etc., where **`unitMaxHull = snapshots[0][column].hull`** (tick-0 baseline — Assumptions; no engine derivation). |
| `alive` | `aliveFlag === 1`. |
| `dead` | `!alive` → dimmed + "DOWN" treatment. |

### ZoneBucket / BattleViewModel — the battlefield projection

For each side, bucket its `UnitView`s by `zoneIdx`:

| Field | Notes |
|---|---|
| `air: UnitView[]` | zoneIdx 0; rendered as the side's Air row (cap 2). |
| `ground: { zone: 'Front'|'Middle'|'Rear', isEmpty, units: UnitView[] }[]` | zoneIdx 1/2/3; **player order `[Rear, Middle, Front]`**, **enemy order `[Front, Middle, Rear]`** so both Fronts sit nearest the contact line (§4, mockup). |

`BattleViewModel = { player: SideView, enemy: SideView }` where
`SideView = { air, airEmpty, ground }`.

### OverallStats — per side, at the current tick (mockup stat bar)

| Field | Derivation |
|---|---|
| `alive` | count of `UnitView.alive` on the side → `n/5`. |
| `hull` | Σ current hull on the side. |
| `damageDealt` | `(opponentMaxHullTotal − opponentCurrentHullTotal)` (mockup's `dmg`). |

Plus the readout: `tickStr = "NNN / total"`, `timeStr = (currentTick/10)+"s"`,
`progress = currentTick / lastTick` (the contact-line node position).

### TimelineMarker — derived **once** per game (FR-015, research C3)

Computed by **one pass** over `games[gameIndex].events` at load/game-select (memoized), never
per frame or per seek:

| Field | Type | Notes |
|---|---|---|
| `tick` | `number` | the tick the event occurred. |
| `kind` | `'planb' \| 'death'` | which marker family (from `TickEvent.t`). |
| `side` | `'friendly' \| 'enemy'` | from the actor/target's `unitOrder` side → tint. |
| `unitInstanceId` | `number` | the unit involved. |
| `label` | `string` | accessible label, e.g. `"Plan B triggered — Rocket Artillery, tick 372"`. |
| `position` (derived) | `tick / lastTick` | left-offset on the track (0..1). |

Markers are **activatable** → `dispatch(seek(marker.tick))`, and **labelled** for screen
readers (FR-015, US4).

---

## Reader-extension surface (`src/sim/replay-view.ts`) — pure, engine-free

Thin helpers over Feature 1's `replay-reader.ts`. **No engine import, no simulation** — every
function is an index or a single pass over the decoded replay. (Full signatures in
[contracts/battle-view.md](./contracts/battle-view.md).)

| Helper | Contract |
|---|---|
| `snapshotAt(gameIndex, tick) → SnapshotRow[]` | **O(1)** array index (`games[g].snapshots[tick]`). |
| `eventsAt(gameIndex, tick) → TickEvent[]` | O(1) array index. |
| `unitMaxHull(column) / unitMaxShield(column)` | tick-0 baseline (`snapshots[0][column]`). |
| `buildViewModel(gameIndex, tick) → BattleViewModel` | pure projection (Tier 3). |
| `deriveMarkers(gameIndex) → TimelineMarker[]` | **one pass** over `events`, memoized. |
| `lastTick(gameIndex) → number` | `snapshots.length - 1`. |

> **Anti-regression contract**: `replay-view.ts` MUST NOT `import`
> `@wfc/engine-wasm` (or any sim module), and `snapshotAt` MUST be a direct index (no loop
> from 0). SC-003/SC-005 assert both.

---

## Entity relationship summary

```
Replay (Feature 1, immutable) ──decoded-once-by──> replay-reader.ts (pure, O(1) index)
        │                                                   │
        │ games[gameIndex] { snapshots[tick], events[tick] }│
        ▼                                                   ▼
PlayerState { gameIndex, currentTick, isPlaying, speed }  replay-view.ts (pure helpers, NO engine)
        │  (rAF loop dispatches only `tick`; seek = clamp) │
        └───────────────► (gameIndex, currentTick) ────────┘
                                   │  pure projection
                                   ▼
     BattleViewModel { player/enemy: SideView{ air, ground[] } }  +  OverallStats
     TimelineMarker[] (derived ONCE per game from events)
                                   │
                                   ▼
                 BattleStage (DOM/CSS) + Scrubber + Controls  (render only)
```

## Consumers / dependencies

- **Consumes (Feature 1):** `replay-reader.ts` + the `Replay`/`GameReplay`/`SnapshotRow`/
  `TickEvent`/`unitOrder` types ([replay-format.md](../001-battle-sim-core/contracts/replay-format.md)).
- **Consumes (Feature 3):** `AppShell`, `UnitIcon` (+ its `MachineTypeKey` map), `Button`,
  `Panel`, `StatBar`, `Chip`, and the semantic tokens/reduced-motion baseline
  ([`../003-app-shell/contracts/components.md`](../003-app-shell/contracts/components.md),
  [`../003-app-shell/contracts/design-tokens.md`](../003-app-shell/contracts/design-tokens.md)).
- **Fed by (Feature 7):** a Server Component calls `getReplay(ctx, matchId)`
  ([`../007-accounts-persistence/contracts/persistence-api.md`](../007-accounts-persistence/contracts/persistence-api.md))
  and passes the typed Replay in; this feature designs none of that.
- **Links to (Feature 6):** "Skip to Outcome" routes to the Battle Summary when present.
