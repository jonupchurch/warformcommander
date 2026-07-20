# Research: Battle Playback

**Feature**: `005-battle-playback` | **Date**: 2026-07-19 | **Plan**: [plan.md](./plan.md)

Resolves the technical unknowns behind the battle-playback UI: **how to render a
pixel-art battle replay in React**, **how to drive playback from a tick-indexed replay
while keeping the scrubber O(1)**, and **how to make the scrubber a correct, accessible
media control**. Format per decision: **Decision / Rationale / Alternatives considered**.
Sources cited inline.

The unknowns cluster into three workstreams — **(A) the rendering approach**, **(B) the
play loop + interpolation + player state**, and **(C) the scrubber UX + accessibility**.
Everything here honors the load-bearing constraint from Feature 1: *decode once, index —
never re-simulate* (constitution **[P6](../../.specify/memory/constitution.md)**; the
previous game's broken scrubber, [`../001-battle-sim-core/contracts/replay-format.md`](../001-battle-sim-core/contracts/replay-format.md),
[Feature 1 research Workstream C](../001-battle-sim-core/research.md)).

---

## Workstream A — Rendering approach

The question: render a **pixel-art battle replay** in React — Canvas 2D vs DOM/CSS-sprites
vs a WebGL lib (PixiJS / `@pixi/react`) vs raw WebGL. The deciding facts of *this* battle:
**positions are discrete zones** (no free x/y movement — §4), **≤10 units across 4 zones**,
**VFX are event-driven** (fire/hit/death from `events[tick]`), and the view must be
**responsive and accessible in both orientations** (P7) inside the Feature 3 design system.

### A1. Renderer → **DOM/CSS sprites (flex/grid), not Canvas/WebGL/PixiJS**

- **Decision**: Render the battlefield as **DOM elements styled by CSS** — a flex/grid of
  zone columns per side, each unit a small component (`UnitIcon` + hull/shield bars), with
  VFX as CSS/transform animations — exactly the structure the
  [Battle Playback mockup](../../reference/Warform%20Commander%20Battle%20Playback.dc.html)
  already proves out. **No `<canvas>`, no WebGL, no PixiJS/`@pixi/react`.**
- **Rationale**: The renderer-choice guidance is unambiguous *for the opposite regime* —
  PixiJS earns its keep at **1000+ sprites at 60fps**, where Canvas "struggles beyond ~100
  moving objects" ([PixiJS](https://pixijs.com/), [Fabric/Konva/Pixi 2026 comparison](https://www.pkgpulse.com/guides/fabricjs-vs-konva-vs-pixijs-canvas-2d-graphics-2026)).
  We have **≤10 units in discrete zones**, i.e. two orders of magnitude below where a GPU
  renderer pays off. Against that, DOM/CSS wins on every axis that matters here:
  1. **Zero added bundle.** PixiJS is ~**450–476 KB min / ~120 KB gzip** and `@pixi/react`
     v8 adds its own layer ([PixiJS v8 launch](https://pixijs.com/blog/pixi-v8-launches),
     [@pixi/react v8](https://pixijs.com/blog/pixi-react-v8-live)); DOM/CSS adds **nothing**.
  2. **Free responsiveness (P7).** Flex/grid + container queries give the portrait/landscape
     layouts *for free* from the same markup — the exact P7 obligation. A canvas is a fixed
     pixel buffer we'd have to re-lay-out and re-scale by hand for every viewport.
  3. **Free accessibility.** DOM nodes are inspectable, labelable, and screen-reader-visible;
     a canvas is an opaque bitmap needing a parallel a11y tree. SC-008 is nearly free with DOM.
  4. **Maximum reuse of Feature 3.** `UnitIcon` (inline `currentColor` SVGs), the semantic
     tokens, faction/zone tints, `StatBar` — all compose directly
     ([`../003-app-shell/contracts/components.md`](../003-app-shell/contracts/components.md)).
     A canvas renderer would re-implement all of it in draw calls.
  5. **Crisp pixel art without a GPU.** The unit art is **line-art SVG** (scales crisply at
     any size); any *raster* VFX gets `image-rendering: pixelated` (nearest-neighbor,
     best at integer multiples) ([MDN: crisp pixel art](https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look),
     [MDN: image-rendering](https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering)).
  - **Not over-engineering** is a first-class goal here (the task's words). DOM is the
    smallest thing that fully satisfies the ask; a GPU renderer would be gold-plating a
    10-sprite scene (Principle IV).
- **Alternatives considered**:
  - *Canvas 2D* — fine up to ~50–100 objects, but forfeits the free responsiveness, the free
    a11y, and the Feature-3 reuse, in exchange for solving a throughput problem we don't have.
    Kept as the **first escape hatch** (A2).
  - *PixiJS / `@pixi/react` v8 (WebGL/WebGPU)* — built for 1000+ sprites and React 19
    ([@pixi/react v8](https://pixijs.com/blog/pixi-react-v8-live), [useTick](https://react.pixijs.io/hooks/useTick/));
    **rejected as over-engineered** for ≤10 discrete-zone units — a heavy dependency and a
    parallel a11y/responsive burden for zero benefit at this scale. Reconsider only if the
    battle model ever gains free 2D movement or large unit counts.
  - *Raw WebGL* — rejected outright: all of Pixi's cost, none of its ergonomics.
- Sources: [PixiJS](https://pixijs.com/), [PixiJS v8 launch](https://pixijs.com/blog/pixi-v8-launches),
  [@pixi/react v8](https://pixijs.com/blog/pixi-react-v8-live),
  [Canvas vs Pixi comparison (2026)](https://www.pkgpulse.com/guides/fabricjs-vs-konva-vs-pixijs-canvas-2d-graphics-2026),
  [MDN crisp pixel art](https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look).

### A2. Documented escape hatch → **Canvas 2D battle layer (only if profiling demands it)**

- **Decision**: If a future profile ever shows DOM churn is a real bottleneck (e.g. the model
  gains dozens of units or free movement), swap **only the battle-stage layer** for a Canvas 2D
  renderer behind the same `BattleStage` props contract — the controls, scrubber, reader, and
  player-state stay untouched. `@pixi/react` is the second hatch beyond that.
- **Rationale**: The `BattleStage`-over-`PlayerState` seam (contracts/battle-view.md) makes the
  renderer swappable without touching the seek/loop logic — so the choice is reversible and
  cheap to revisit. We do **not** build it now (YAGNI / Principle IV).

### A3. VFX + smoothing → **CSS transitions/keyframes, gated by `prefers-reduced-motion`**

- **Decision**: Firing/hit/death cues and bar/position changes are **CSS transitions and
  keyframe animations** on DOM nodes, all gated behind `motion-safe:` / the Feature 3
  reduced-motion reset ([`../003-app-shell/contracts/design-tokens.md`](../003-app-shell/contracts/design-tokens.md)).
- **Rationale**: State is always readable from the snapshot; VFX are *texture*, so removing
  them under reduced motion loses no information (FR-020, SC-009). CSS transitions on `width`
  (bars) and `transform` (zone slides) let React update **once per tick** while the browser
  interpolates the visual between ticks on the compositor — no extra React state churn (B3).
- Sources: [MDN image-rendering](https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering),
  [Feature 3 design-tokens contract](../003-app-shell/contracts/design-tokens.md).

---

## Workstream B — Play loop, interpolation & player state

### B1. Play loop → **single `requestAnimationFrame` loop with a time→tick accumulator**

- **Decision**: One `requestAnimationFrame` loop, running only while `isPlaying`. Each frame:
  accumulate `deltaMs`, and while the accumulator ≥ `100 / speed` ms, advance `currentTick`
  by 1 (10 t/s × speed) until caught up or the last tick is hit; render the frame for the
  integer `currentTick`. This is the standard **fixed-timestep accumulator** pattern, with our
  fixed step being **one replay tick (100 ms at 1×)**.
  ```
  const stepMs = 100 / speed;          // 10 t/s × speed
  accumulator += now - last; last = now;
  while (accumulator >= stepMs && currentTick < lastTick) {
    currentTick += 1; accumulator -= stepMs;
  }
  ```
- **Rationale**: `requestAnimationFrame` is the correct scheduling backbone (throttles in
  background tabs, syncs to the display); the **accumulator decouples tick advance from frame
  rate**, so playback shows the same tick sequence on a 60 Hz and a 144 Hz display and at any
  speed — the textbook fixed-timestep result
  ([Gaffer/fix-your-timestep lineage](https://gafferongames.com/post/floating_point_determinism/),
  [Isaac Sukin: JS game loops & timing](https://isaacsukin.com/news/2015/01/detailed-explanation-javascript-game-loops-and-timing),
  [JS fixed-timestep loop](https://zeroberry.me/post/javascript-fixed-timestep-game-loop/)).
  A **plain `setInterval(…, 100/speed)`** (what the mockup uses at 70 ms) drifts and stutters
  and doesn't survive tab-throttling — fine for a mockup, not for the shipped player.
- **Alternatives considered**: *`setInterval` tick timer* — rejected (drift, no rAF sync,
  janky under load); the mockup's 70 ms interval is illustrative only. *A per-frame simulation*
  — **forbidden by P6** (no simulation at all).
- Sources: [Isaac Sukin: detailed JS game loops](https://isaacsukin.com/news/2015/01/detailed-explanation-javascript-game-loops-and-timing),
  [Aleksandr Hovhannisyan: performant JS game loops](https://www.aleksandrhovhannisyan.com/blog/javascript-game-loop/),
  [JS fixed-timestep game loop](https://zeroberry.me/post/javascript-fixed-timestep-game-loop/).

### B2. Interpolation → **integer tick is the unit of truth; smoothing is CSS-only, not sub-tick state**

- **Decision**: The **seekable, renderable unit is always the integer tick.** The accumulator's
  fractional remainder (`alpha = accumulator / stepMs`) is *not* used to fabricate in-between
  battle state — positions are **discrete zones**, so there is nothing to interpolate in the
  model. Visual smoothing (bars easing, a unit sliding when it changes zone on a `move` event)
  is **CSS transitions** between consecutive integer-tick renders, not extra React state.
- **Rationale**: This is the crux of avoiding the previous game's bug and honoring P6. Classic
  fixed-timestep interpolation blends the *previous* and *current* physics states with `alpha`
  for smooth free motion ([Isaac Sukin](https://isaacsukin.com/news/2015/01/detailed-explanation-javascript-game-loops-and-timing),
  [KSH: interpolated physics rendering](https://kirbysayshi.com/2013/09/24/interpolated-physics-rendering.html))
  — but our model has **no free motion** to blend, so importing sub-tick interpolation would
  mean *inventing* battle state the engine never produced (a P6 violation and a correctness
  hazard). Keeping the tick integral means **any tick is exactly `snapshots[tick]`**, so seek
  and play render identically (FR-017), and the scrubber's O(1) guarantee is trivially true.
  CSS handles the "looks smooth between ticks" need on the compositor thread for free.
- **Alternatives considered**: *Blend `snapshots[t]`↔`snapshots[t+1]` by `alpha`* — rejected:
  fabricates non-authoritative intermediate state (P6), and buys nothing for discrete zones;
  hull-bar easing achieves the same perceived smoothness via CSS without touching the model.
- Sources: [Isaac Sukin](https://isaacsukin.com/news/2015/01/detailed-explanation-javascript-game-loops-and-timing),
  [KSH: interpolated physics rendering](https://kirbysayshi.com/2013/09/24/interpolated-physics-rendering.html).

### B3. Player state in React → **a reducer + a rAF loop in a ref; render keyed on `currentTick`**

- **Decision**: Model `PlayerState = { gameIndex, currentTick, isPlaying, speed }` as a
  `useReducer` (actions: `play`/`pause`/`seek(tick)`/`step(±n)`/`setSpeed`/`selectGame`/`tick`).
  The rAF loop lives in a `useRef` (started/stopped by an effect keyed on `isPlaying`/`speed`),
  and dispatches `tick`/`seek` to bump `currentTick`. **React re-renders once per integer tick**
  (≤ ~20/sec at 2×) — cheap for ≤10 DOM units; per-frame visual easing is CSS (B2). Seek is a
  synchronous `seek(tick)` dispatch (pointer/keyboard), independent of the loop.
- **Rationale**: A reducer makes the state machine explicit and testable (the seek/step/play
  transitions are the spec's contract), and keeping the loop in a ref avoids re-creating it each
  render. Driving React off the **integer tick** (not the rAF frame) keeps re-render volume tiny
  and makes `frame = f(gameIndex, currentTick)` a pure projection (FR-016/FR-017). `@pixi/react`'s
  `useTick` is the analogous idea *inside* Pixi ([useTick](https://react.pixijs.io/hooks/useTick/)),
  but we don't adopt Pixi (A1), so our own ref-held rAF loop is the DOM equivalent.
- **Alternatives considered**: *State in a rAF-frequency `useState`* — rejected: re-renders at
  display rate (60–144/s) for no benefit when the model only changes per tick. *An external store
  (`useSyncExternalStore`)* — viable and a clean upgrade if profiling shows reducer re-renders are
  hot, but unnecessary at 10 units; recorded as a future option.
- Sources: [@pixi/react useTick](https://react.pixijs.io/hooks/useTick/),
  [DEV: professional game loop in TS](https://dev.to/stormsidali2001/building-a-professional-game-loop-in-typescript-from-basic-to-advanced-implementation-eo8).

### B4. Seek stays O(1) → **`seek(tick)` = one `reader.snapshotAt(tick)` index, never a re-run**

- **Decision**: Every seek (drag, click, arrow, marker, jump) is a single
  `dispatch(seek(clamp(tick, 0, lastTick)))`; the render then reads `snapshots[tick]` by index.
  There is **no loop from 0**, no accumulation, no engine call — the O(1) property is structural,
  inherited from Feature 1's snapshots-not-deltas format
  ([replay-format contract](../001-battle-sim-core/contracts/replay-format.md)). The anti-regression
  test (SC-003/SC-005) asserts a last-tick seek touches the same bounded number of array reads as a
  tick-1 seek and that `@wfc/engine-wasm` is never imported/invoked.
- **Rationale**: The previous game's scrubber broke precisely because seeking required replaying
  from the start; the entire point of the format + this design is that seek is an array index.
  Making it a single dispatch (not a fast-forward) is what keeps it O(1) in *this* layer too.

### B5. Seek-during-play → **jump-and-continue (playing) / jump-and-stay (paused); scrub coalesces**

- **Decision**: Scrubbing while **playing** jumps to the target tick and **continues** from
  there (the loop's `last`/accumulator reset to the seek instant); scrubbing while **paused**
  jumps and stays paused. Rapid drag **coalesces** to the latest pointer value (each pointer
  event is one O(1) seek; no queue). This behavior is fixed and tested (US2-AS2, edge cases).
- **Rationale**: Jump-and-continue matches how video scrubbers behave and keeps the readout and
  frame in lockstep (both are `f(currentTick)`); coalescing avoids any backlog because there is
  never work to back up — each value is one index.

---

## Workstream C — Scrubber UX & accessibility

### C1. Scrubber semantics → **WAI-ARIA "Media Seek Slider" pattern**

- **Decision**: Implement the scrubber as a **slider** per the W3C APG **Media Seek Slider**
  example: `role="slider"`, `aria-valuemin=0`, `aria-valuemax=lastTick`, `aria-valuenow=currentTick`,
  and a human-readable **`aria-valuetext`** (e.g. *"tick 412 of 1000, 41.2 seconds"*) so screen
  readers announce a meaningful position, not a bare number. `aria-label`/labelled by "Battle
  timeline".
- **Rationale**: This is the canonical accessible seek control; APG explicitly frames it as
  *"a seek control that could be used to move the current play position in an audio or video
  media player,"* and stresses `aria-valuetext` because raw numeric positions are hard to
  comprehend by ear ([APG Media Seek Slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-seek/),
  [APG Slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/)).
- **Implementation note**: A styled native `<input type="range">` (what the mockup uses) is the
  pragmatic base — it's a keyboard-operable slider out of the box — augmented with `aria-valuetext`
  and the event-marker overlay. If the marker overlay / custom track fights the native element, fall
  back to a div-based APG slider. Either way the **pattern** above is the contract.
- Sources: [W3C APG Media Seek Slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-seek/),
  [W3C APG Slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/),
  [W3C WAI-ARIA overview](https://www.w3.org/WAI/standards-guidelines/aria/).

### C2. Keyboard model → **Arrow ±1 tick · Home/End first/last · PageUp/PageDown ±N**

- **Decision**: Left/Down = −1 tick, Right/Up = +1 tick, **Home** = tick 0, **End** = last tick,
  **PageUp/PageDown** = ±10 ticks (one second). Space/`K` toggles play/pause on the player;
  `J`/`L` step back/forward a chunk (video-editor convention, optional). Focus is always visible
  (Feature 3 `--ring`).
- **Rationale**: Arrow/Home/End are exactly the APG slider key bindings ([APG Slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider/));
  PageUp/PageDown for a larger step is the standard slider "big step." Anchoring the big step to
  **one second = 10 ticks** keeps it legible against the tick/time readout.
- Sources: [W3C APG Slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/).

### C3. Event markers → **computed once on load; positioned at `tick/lastTick`; activatable + labelled**

- **Decision**: On load (per selected game), do **one pass** over `events[]` to collect `planb`
  and `death` ticks into `TimelineMarker[]`; render them as absolutely-positioned nodes over the
  track at `left: tick/lastTick*100%`, tinted by kind/side, each focusable/activatable to
  `seek(tick)` and carrying an accessible label ("Plan B triggered — Rocket Artillery, tick 372").
  Memoized; never recomputed per frame/seek (FR-015, US4-AS4).
- **Rationale**: Markers are a pure function of the (immutable) game's events, so computing them
  once is both correct and cheap; overlaying them on the native-range track is a standard
  progress-bar-annotation technique and keeps the O(1) seek path untouched.

### C4. Touch caveat → **note, don't over-engineer**

- **Finding / Decision**: Touch-based assistive tech can struggle to drive slider widgets (it must
  synthesize key events, inconsistently) ([APG Media Seek Slider notes](https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-seek/)).
  Mitigation: also provide **discrete** controls (frame-step, jump-to-start/end, marker taps) so a
  precise position is reachable without dragging — which we already ship (FR-014). No bespoke
  touch-slider engineering.
- Sources: [W3C APG Media Seek Slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-seek/),
  [TestParty: accessible sliders/media](https://testparty.ai/blog/accessible-carousels-sliders-auto-playing-media).

---

## Cross-cutting decisions (summary for plan.md Technical Context)

| Area | Decision |
|---|---|
| **Renderer** | **DOM/CSS sprites** (flex/grid zone columns, `UnitIcon`, token-styled bars); no Canvas/WebGL/Pixi at ≤10 discrete-zone units. Canvas 2D is the documented escape hatch behind the `BattleStage` seam. |
| **Pixel-art crispness** | line-art SVG scales crisply; `image-rendering: pixelated` on any raster VFX (best at integer multiples). |
| **Play loop** | one `requestAnimationFrame` loop (ref-held), **time→tick accumulator**, fixed step = 100/speed ms; halts at last tick; cleaned up on pause/unmount. |
| **Interpolation** | **none in the model** — integer tick is the unit of truth (discrete zones); smoothing is CSS transitions between tick renders, reduced-motion-gated. |
| **Player state** | `useReducer` state machine `{ gameIndex, currentTick, isPlaying, speed }`; React re-renders per tick (≤~20/s); `frame = f(gameIndex, currentTick)`. |
| **Seek** | `seek(tick)` = one `reader.snapshotAt(tick)` index — O(1), **never** an engine call or a fast-forward. Anti-regression test (SC-003/SC-005). |
| **Seek-during-play** | jump-and-continue (playing) / jump-and-stay (paused); rapid drag coalesces (each value = one index). |
| **Scrubber a11y** | WAI-ARIA **Media Seek Slider**: `role="slider"` + `aria-valuenow/min/max` + human-readable `aria-valuetext`; Arrow ±1 / Home/End / PageUp/PageDown ±10; visible focus. |
| **Markers** | computed once per game from a single `events` pass; positioned `tick/lastTick`; activatable + labelled; memoized. |
| **Reduced motion** | reuse Feature 3 baseline; VFX + transitions suppressed, playback/seek/readouts fully functional. |

All spec unknowns (rendering approach, play loop/interpolation, scrubber UX/accessibility)
are resolved. No unresolved unknowns remain for Phase 1.
