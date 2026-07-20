# Contract: Battle View — components & reader extension

**Feature**: `005-battle-playback` | **Spec**: [../spec.md](../spec.md) | **Data model**:
[../data-model.md](../data-model.md)

The public API surface of the battle-playback screen: the **reader-extension** the view sits
on (pure, engine-free), the **player-state hook** (the state machine + rAF loop), and the
**component tree** (stage, controls, scrubber, markers). Signatures are TypeScript-shaped
contracts (illustrative, not the implementation).

Conventions (match Feature 3): components live under `src/components/battle/`, are
token-driven (no raw hex), forward `className`, use `cn()`, and are **Server Components by
default with `"use client"` pushed to the interactive leaves** (`BattlePlayer`, `Scrubber`,
the controls) per [`../../stacks/nextjs.md`](../../stacks/nextjs.md). Every visual surface
composes Feature 3 primitives/tokens
([`../003-app-shell/contracts/components.md`](../003-app-shell/contracts/components.md)).

**The load-bearing contract (P6, the anti-regression):** nothing in this surface may import
`@wfc/engine-wasm` or any simulation module; **seek is an array index, never a re-run**. The
tests in [SC-003/SC-005](../spec.md#measurable-outcomes) enforce it.

---

## 1. Reader extension — `src/sim/replay-view.ts` (pure, NO engine)

Thin helpers over Feature 1's `src/sim/replay-reader.ts`
([replay-format contract](../001-battle-sim-core/contracts/replay-format.md)). Every function
is an **index** or a **single pass** over the already-decoded replay. This module MUST NOT
import the engine or perform any simulation.

```ts
import type { Replay, GameReplay, SnapshotRow, TickEvent } from "@/sim/replay-reader";
// (types re-exported from Feature 1's reader — reused, not redefined)

export interface ReplayView {
  readonly gamesCount: number;                 // replay.games.length (Bo3: 1–3)
  lastTick(gameIndex: number): number;         // snapshots.length - 1  (O(1))

  snapshotAt(gameIndex: number, tick: number): SnapshotRow[];  // O(1) index — the seek primitive
  eventsAt(gameIndex: number, tick: number): TickEvent[];      // O(1) index

  unitMaxHull(column: number): number;         // = snapshotAt(g,0)[column].hull  (tick-0 baseline)
  unitMaxShield(column: number): number;

  buildViewModel(gameIndex: number, tick: number): BattleViewModel;  // pure projection (data-model Tier 3)
  deriveMarkers(gameIndex: number): TimelineMarker[];                // ONE pass over events, memoized
}

// Constructed once from a decoded replay; holds NO engine reference and runs NO sim.
export function createReplayView(replay: Replay, playerSide: "A" | "B"): ReplayView;
```

**Guarantees**

1. `snapshotAt`/`eventsAt`/`lastTick` are **O(1)** — a single array index, no loop from 0
   (SC-003). Seeking the last tick of a 1000-tick game touches the same bounded number of
   reads as seeking tick 1.
2. `createReplayView`/`ReplayView` **import no engine module**; no method simulates (SC-005).
3. `deriveMarkers(g)` is computed **once per game** and memoized (FR-015).
4. `buildViewModel(g, t)` is a **pure function** of `(g, t)` over the immutable replay
   (FR-017) — same inputs → same frame, whether reached by play or seek.

---

## 2. Player state — `src/components/battle/use-playback.ts` (`"use client"`)

The state machine (data-model Tier 2) + the `requestAnimationFrame` loop.

```ts
export type Speed = 0.5 | 1 | 2;

export interface PlayerState {
  gameIndex: number;
  currentTick: number;
  isPlaying: boolean;
  speed: Speed;
}

export type PlaybackAction =
  | { type: "play" } | { type: "pause" } | { type: "tick" }
  | { type: "seek"; tick: number }
  | { type: "step"; delta: number }
  | { type: "setSpeed"; speed: Speed }
  | { type: "selectGame"; gameIndex: number };

export interface PlaybackApi extends PlayerState {
  lastTick: number;
  atEnd: boolean;
  // action dispatchers (thin wrappers around dispatch)
  play(): void; pause(): void; toggle(): void;
  seek(tick: number): void;               // O(1): clamp + dispatch; render indexes snapshotAt
  step(delta: number): void;              // pause + seek(currentTick+delta)
  setSpeed(speed: Speed): void;
  selectGame(gameIndex: number): void;
}

// Owns the reducer AND the ref-held rAF accumulator loop (100/speed ms → integer tick).
// The loop dispatches ONLY { type: "tick" } and is cleaned up on pause/unmount.
export function usePlayback(view: ReplayView, opts?: { initialGame?: number }): PlaybackApi;
```

**Guarantees**

- The rAF loop maps elapsed wall-clock time → **integer ticks** at `10 × speed` t/s via an
  accumulator (research B1), advancing only via `tick`, halting at `lastTick`, and torn down
  on pause/unmount. It **never** calls the engine.
- `seek` is synchronous and O(1); it is independent of the loop (works while paused or
  playing). Seek-during-play = **jump-and-continue**; seek-while-paused = **jump-and-stay**
  (research B5). Rapid seeks coalesce (each value is one index).
- `speed` changes re-pace without dropping ticks (FR-013); `selectGame` resets to tick 0.

---

## 3. Components — `src/components/battle/*`

### `BattlePlayer` — `battle-player.tsx` (`"use client"`)

The root. Given a decoded Replay, it constructs the `ReplayView`, drives `usePlayback`, and
composes the stage + stats + controls + scrubber. The **only** stateful client boundary.

```ts
interface BattlePlayerProps {
  replay: Replay;                 // already fetched + typed (Feature 7); reader gates formatVersion
  playerSide: "A" | "B";          // which side is "friendly" for the viewer
  initialGame?: number;           // default 0
  summaryHref?: string;           // "Skip to Outcome" target (Feature 6) when present
}
```

Guarantees: constructs `createReplayView(replay, playerSide)`; if the reader rejects the
`formatVersion`, renders the **graceful reject** state and **zero battle frames** (FR-003,
SC-007) — never a partial battlefield. Imports no engine module.

### `BattleStage` — `battle-stage.tsx` (the swappable render seam)

Renders the whole two-side, 4-zone battlefield for one tick. **Pure render** of a
`BattleViewModel` — no state, no loop. This is the seam the Canvas escape hatch (research A2)
swaps behind.

```ts
interface BattleStageProps {
  view: BattleViewModel;          // buildViewModel(gameIndex, currentTick)
  progress: number;               // currentTick / lastTick → contact-line node
}
```

Composes `ZoneColumn` (×3 per side) + the Air rows + `ContactLine`; DOM/flex/grid so both
orientations lay out from the same markup (P7). Reduced-motion-safe.

### `ZoneColumn` — `zone-column.tsx` · `UnitSprite` — `unit-sprite.tsx`

```ts
interface ZoneColumnProps { zone: "Air"|"Front"|"Middle"|"Rear"; units: UnitView[]; side: "friendly"|"enemy"; isEmpty: boolean; }
interface UnitSpriteProps { unit: UnitView; events?: TickEvent[]; }   // events → motion-safe VFX for this unit
```

`UnitSprite` reuses Feature 3 `UnitIcon` (faction/zone tint via `currentColor`) + token-styled
hull/shield bars; dead → dimmed + "DOWN". VFX (fire/hit/death) are CSS keyframes gated by
`motion-safe:` (FR-007, FR-020).

### `OverallStats` — `overall-stats.tsx` · `ContactLine` — `contact-line.tsx` · `GameSelector` — `game-selector.tsx`

```ts
interface OverallStatsProps { player: SideStats; enemy: SideStats; tickStr: string; timeStr: string; gameLabel: string; }
interface ContactLineProps { progress: number; }                     // 0..1 node position
interface GameSelectorProps { count: number; active: number; onSelect(gameIndex: number): void; }  // GAME 1/2/3 tabs (only games present)
```

### `PlaybackControls` — `playback-controls.tsx` (`"use client"`)

The control cluster (mockup): jump-to-start, frame-step ◄◄, play/pause, frame-step ►►,
jump-to-end, speed toggle (0.5×/1×/2×), and "Skip to Outcome →".

```ts
interface PlaybackControlsProps {
  isPlaying: boolean; speed: Speed; atEnd: boolean;
  onToggle(): void; onStep(delta: number): void;
  onJumpStart(): void; onJumpEnd(): void; onSetSpeed(s: Speed): void;
  summaryHref?: string;                 // Skip-to-Outcome → Feature 6
}
```

Guarantees: all buttons are Feature 3 `Button`s, keyboard-operable, visible focus; Space/`K`
toggles play/pause (research C2).

### `Scrubber` — `scrubber.tsx` (`"use client"`) — **the headline**

The WAI-ARIA **media-seek slider** + the event-marker overlay.

```ts
interface ScrubberProps {
  currentTick: number; lastTick: number; tickRate: number;   // for aria-valuetext seconds
  markers: TimelineMarker[];
  onSeek(tick: number): void;           // O(1) — dispatches seek
}
```

Guarantees (research C1/C2/C3):

- `role="slider"`, `aria-valuemin={0}`, `aria-valuemax={lastTick}`, `aria-valuenow={currentTick}`,
  and a human-readable `aria-valuetext` (e.g. `"tick 412 of 1000, 41.2 seconds"`); labelled
  "Battle timeline".
- Keyboard: Left/Down −1, Right/Up +1, **Home** 0, **End** lastTick, **PageUp/PageDown** ±10.
- Pointer drag / click-on-track → `onSeek(tick)`; each pointer value is **one O(1) seek**
  (rapid drag coalesces; no re-sim per intermediate value — SC-003).
- Renders `TimelineMarkers` over the track; visible focus ring (Feature 3 `--ring`).
- Base impl = styled native `<input type="range">` augmented with `aria-valuetext` + overlay;
  falls back to a div-based APG slider if the overlay fights the native element.

### `TimelineMarkers` — `timeline-markers.tsx`

```ts
interface TimelineMarkersProps { markers: TimelineMarker[]; onSeek(tick: number): void; }
```

Each marker: absolutely positioned at `marker.position*100%`, tinted by `kind`/`side`,
focusable/activatable → `onSeek(marker.tick)`, with `marker.label` as its accessible name
(FR-015).

---

## 4. Route contract — `app/(app)/battle/[matchId]/page.tsx` (Server Component)

```ts
// Server Component: fetch + gate, then hand off to the client player.
export default async function BattlePage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;                 // async params (Next 16)
  const replay = await getReplay(ctx, matchId);     // Feature 7 — server-only, ownership-checked
  // reader gates formatVersion inside BattlePlayer; unsupported → graceful reject (error.tsx / in-component)
  return <BattlePlayer replay={replay} playerSide={/* from match/ctx */} summaryHref={/* Feature 6 */} />;
}
```

Guarantees: the **fetch is server-side** (Feature 7, ownership-enforced); the page passes a
typed Replay to the client player; `loading.tsx` shows a skeleton; `error.tsx` (and the
in-component reject state) cover missing/unsupported replays (FR-003, SC-007). The route sits
inside the Feature 3 authenticated shell, which resolves the active top-level nav destination.

---

## Contract guarantees (summary)

- **P6 — pure player**: no component or helper imports `@wfc/engine-wasm`; seek is an array
  index; no frame is fabricated (SC-001, SC-003, SC-005).
- **P7 — both orientations**: the DOM/flex/grid stage + controls + scrubber lay out first-class
  in portrait and landscape from one markup (SC-004).
- **Token-only + accessible**: every surface composes Feature 3 primitives/tokens; the scrubber
  is a WAI-ARIA media-seek slider; reduced-motion baseline reused (SC-008, SC-009).
- **Swappable renderer**: `BattleStage(view, progress)` is a pure projection seam — the Canvas
  escape hatch swaps behind it without touching the loop/seek logic (research A2).
