# Implementation Plan: Battle Playback

**Branch**: `005-battle-playback` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-battle-playback/spec.md`

## Summary

Build the **battle-playback screen** — the pixel-art battle viewer with a **working
scrubber** — that renders Feature 1's tick-indexed Replay as a watchable, seekable battle
across the four zones per side (constitution **[P6](../../.specify/memory/constitution.md)**,
**P7**). It is the **render layer over a pure data reader**: it consumes Feature 1's
`src/sim/replay-reader.ts` (O(1) tick indexing, `formatVersion` gate) and Feature 3's design
system (`AppShell`, `UnitIcon`, tokens, primitives), and it **never imports or calls the
simulation engine** — every frame is produced by indexing the decoded replay, never by
simulation (the fix for the previous game's broken, re-simulate-to-seek viewer).

The two design problems, both resolved in [research.md](./research.md): **(1) the right,
not-over-engineered renderer** — **DOM/CSS sprites** (flex/grid zone columns reusing
`UnitIcon` + token-styled bars), because positions are discrete zones, units are ≤10, VFX
are event-driven, and both orientations must be first-class; a GPU renderer (Pixi/WebGL)
would be gold-plating a 10-sprite scene and forfeit free responsiveness/accessibility; and
**(2) a play loop that keeps the scrubber O(1)** — a single `requestAnimationFrame` loop
with a **time→tick accumulator** whose only job is to advance an **integer tick** and index
the reader, so seeking any tick is one array read (never a re-run), and visual smoothing is
CSS-only (no fabricated sub-tick state → no P6 violation).

## Technical Context

**Language/Version**: **TypeScript** on **Next.js 16** (App Router, Turbopack), **React 19**.
No new language surface (contrast with Feature 1's Rust). CSS via **Tailwind v4** + the
Feature 3 token system.

**Primary Dependencies**: The **existing stack only** — React 19, Next 16, Tailwind v4, the
Feature 3 design system (`AppShell`, `UnitIcon`, `Button`, `Panel`, `StatBar`, `Chip`,
tokens), and Feature 1's pure `src/sim/replay-reader.ts`. **No new runtime dependency**
(explicitly *not* PixiJS/`@pixi/react`/a canvas lib — research A1). Dev/test:
`@playwright/test` + `@axe-core/playwright` (present per Feature 3), and Vitest/RTL (or the
repo's unit runner) for the reducer/loop/anti-regression tests.

**Storage**: **N/A** — this feature persists nothing and fetches nothing itself. It receives
an already-fetched, typed **Replay** (from a Server Component calling Feature 7's
`getReplay` — [`../007-accounts-persistence/contracts/persistence-api.md`](../007-accounts-persistence/contracts/persistence-api.md))
and renders it client-side.

**Testing**: **Playwright** e2e for the scrubber/seek, speed, markers, and **both
orientations** (360×640 / 1440×900 / 320px); **`@axe-core/playwright`** for the media-player
a11y (slider role/values, focus) + reduced-motion; and **unit/integration** tests for the
player-state reducer, the rAF accumulator (speed→tick-rate), and the **anti-regression
guarantees** — a test asserting **seek does not invoke the engine and is O(1)** (SC-003,
SC-005). Matches Principle VIII + [`stacks/nextjs.md`](../../stacks/nextjs.md) ("`next build`
passes; changed route renders").

**Target Platform**: The **browser**, both **mobile portrait AND desktop landscape as
co-equal first-class targets** (P7). The battle view is **client-rendered** (`"use client"`
`BattlePlayer`), fed by a Server Component page that fetched the Replay. Deployed on Vercel.

**Project Type**: A **screen feature inside the existing Next.js app** — a route under the
Feature 3 authenticated shell (`app/(app)/battle/[matchId]/`) plus playback components under
`src/components/battle/` and a thin reader extension under `src/sim/`. No new package/sub-app.

**Performance Goals**: **Seek any tick < 16 ms** (one frame) with **zero re-simulation**
(SC-002); **O(1) seek** independent of target-tick magnitude (SC-003); **no horizontal
overflow** 320px→ultra-wide (SC-004); smooth play/scrub on the 1000-tick × 10-unit worst
case (the decoded replay is tens-to-low-hundreds of KB — Feature 1 research C5).

**Constraints**: **P6 is absolute** — the playback module imports/calls the engine **zero**
times; all state comes from indexing the decoded replay (SC-005). **P7 is the hard UI
constraint** — both orientations designed *for*, not adapted (SC-004). **Token-only
styling** — no raw brand hex; compose Feature 3 primitives/tokens (Feature 3 SC-002).
**`prefers-reduced-motion`** honored (SC-009). **WCAG AA / zero serious a11y violations**
(SC-008).

**Scale/Scope**: The playback screen = the battle-stage renderer (4 zones × 2 sides, ≤10
units), the playback control cluster (play/pause, speed, frame-step, jump), the **scrubber**
(O(1) seek + event markers + media-slider a11y), the player-state machine + rAF loop, the
Bo3 game selector, and the responsive/a11y/reduced-motion baseline. **Not** the engine (F1),
storage/fetch (F7), the summary screen (F6), matchmaking (F8), the Garage (F4), or the design
system itself (F3) — those are consumed or linked, not built (FR-021).

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1 design. Constitution v3.0.0 —
Product Invariants P1–P8 + Engineering Process I–IX.*

### Product & Architecture Invariants

| Invariant | Status | How this plan satisfies it |
|---|---|---|
| **P1 Non-P2W by construction** | ✅ (N/A here) | Playback is a read-only viewer; it sells and gates nothing and cannot affect power or outcomes. |
| **P2 Planning over twitch** | ✅ (N/A here) | No battle input lives here — the battle is already resolved; the player only watches/scrubs. No twitch surface. |
| **P3 Depth from configuration** | ✅ (enabling) | The viewer *reveals* the depth (dials, Plan-B beats, the counter-web resolving) by rendering the tick stream + event markers — it shows configuration paying off, without adding roster/art. |
| **P4 Fairness is verified** | ✅ (N/A here) | No balance surface; it renders a resolved replay faithfully so a human can *see* the outcome the engine/balancer already produced. |
| **P5 Content from players/puzzles** | ✅ (enabling) | This is the screen that makes player-vs-player defense battles **watchable** — the payoff of the player-as-content loop. |
| **P6 Deterministic, seeded, server-authoritative (NON-NEG)** | ✅ **the spine of this feature** | The client is a **pure replay player**: it imports **only** the reader, indexes `snapshots[tick]`, and **never** imports/calls `@wfc/engine-wasm` or simulates anything (FR-001, SC-005). Seek is an array index, not a re-run (FR-011, SC-003). No frame is ever fabricated — every frame is `snapshots[tick]` verbatim (FR-017, SC-001). This is the design that makes the previous game's re-simulate-to-seek bug structurally impossible. |
| **P7 Both platforms first-class (NON-NEG for this feature)** | ✅ **headline UI deliverable** | The battlefield, controls, and scrubber are **co-equally first-class** in portrait and landscape (DOM/flex/grid → free responsiveness; FR-018, SC-004), verified at 360px and 1440px. Portrait is designed *for*, not a squeezed landscape. |
| **P8 Data-driven content** | ✅ | Rendering is driven entirely by the typed Replay + `unitOrder` (FR-004) and Feature 3 tokens/`UnitIcon` — no hardcoded rosters, positions, or colors. Consumes Feature 1's shared data model, redefining none of it. |

### Engineering Process (I–IX)

| Principle | Status | Note |
|---|---|---|
| **I Clarify** | ✅ | Prioritized independently-testable stories, acceptance scenarios, explicit non-goals (FR-021); the judgment calls (renderer, interpolation, max-HP baseline, seek-during-play) are stated in Assumptions/research. Zero open `NEEDS CLARIFICATION`. |
| **II Validated trust boundaries** | ✅ (light) | The only untrusted input is the Replay; it is gated by the reader's `formatVersion` check and rejected gracefully (FR-003, SC-007) — no partial render. Auth/ownership of the fetch is Feature 7's server-side concern (noted, not built). |
| **III Match conventions** | ✅ | Composes Feature 3's shell/primitives/tokens and Feature 1's reader; follows [`stacks/nextjs.md`](../../stacks/nextjs.md) (Server Component page fetches; `"use client"` pushed to the interactive `BattlePlayer` leaf). New battle components sit under `src/components/battle/`, matching the `src/components/*` split Feature 3 established. |
| **IV Scope discipline (NON-NEG)** | ✅ | Only the playback screen + controls over an already-fetched Replay. Engine, storage/fetch, summary, matchmaking, Garage all explicitly **out** (FR-021) — named, not folded in. The GPU renderer is *deliberately declined* as over-engineering (research A1). |
| **V Verify before done** | ✅ | SC-001..010 are executable (Playwright/axe + reducer/loop unit tests + the anti-regression seek test); "done" = green across the viewport matrix + `next build` + typecheck ([quickstart maps to the SCs]). |
| **VI Narrate** | ✅ | research.md records every decision + rejected alternatives with sources; the renderer and interpolation judgment calls are argued explicitly. |
| **VII Plan whole set first** | ✅ | Part of the foundation-first planning pass; this plan binds to the already-planned Feature 1 replay contract + Feature 3 design system + Feature 7 persistence API (cross-feature deps surfaced on paper). |
| **VIII Test at right level** | ✅ | e2e (Playwright viewport + a11y — the right level for a responsive media player); unit/integration for the reducer, the accumulator's speed→tick-rate, and the **engine-never-called / O(1)-seek** anti-regression (the highest-signal tests here). |
| **IX Commit atomically, branch per feature** | ✅ | On `005-battle-playback`; artifacts + implementation commit atomically per phase/story. |

**Gate result: PASS.** No deviations require Complexity Tracking. The never-waived
invariants in play — **P6** (client never simulates) and **P7** (both orientations) — are
satisfied **structurally by design**, not traded: P6 by importing only the reader and making
seek an array index, P7 by a DOM layout that is first-class in both orientations.

## Project Structure

### Documentation (this feature)

```text
specs/005-battle-playback/
├── plan.md              # this file
├── spec.md              # prioritized stories, FRs, success criteria
├── research.md          # Phase 0 — renderer / play-loop / scrubber-a11y decisions
├── data-model.md        # Phase 1 — PlayerState machine, TimelineMarker, derived view model
├── contracts/
│   └── battle-view.md   # component API surface (BattlePlayer/BattleStage/Scrubber/…) + reader-extension contract
└── tasks.md             # Phase 2 — created by /speckit-tasks (next)
```

### Source Code (repository root)

The existing Next.js app is at the **repo root**; Feature 3's authenticated shell is
`app/(app)/layout.tsx` and shared UI lives under `src/components/`. This feature adds a route
inside the shell and a `battle/` component group — additive, no restructuring.

```text
d:/Codelib/warformcommander/
├── app/
│   └── (app)/                              # Feature 3 authenticated shell (existing)
│       └── battle/
│           └── [matchId]/
│               ├── page.tsx                # NEW — Server Component: fetch Replay (Feature 7 getReplay), gate, pass to BattlePlayer
│               ├── loading.tsx             # NEW — skeleton while the replay loads
│               └── error.tsx               # NEW — graceful "replay unavailable / unsupported format" state (FR-003, SC-007)
├── src/
│   ├── sim/                                # Feature 1 owns replay-reader.ts; this feature extends it minimally
│   │   ├── replay-reader.ts                # EXISTING (Feature 1) — the pure O(1) reader; consumed, not modified in spirit
│   │   └── replay-view.ts                  # NEW — thin view helpers over the reader: snapshotAt/eventsAt buckets,
│   │                                       #        unitMaxHull (tick-0 baseline), deriveMarkers() — NO engine, NO sim
│   └── components/
│       └── battle/                         # NEW — the playback component group
│           ├── battle-player.tsx           # NEW ("use client") — owns PlayerState (useReducer) + the rAF loop; composes the rest
│           ├── use-playback.ts             # NEW ("use client") — the reducer + rAF accumulator loop hook (play/pause/seek/step/speed/game/tick)
│           ├── battle-stage.tsx            # NEW — the two-side, 4-zone DOM/CSS battlefield (the swappable render seam)
│           ├── zone-column.tsx             # NEW — one zone's unit stack (reuses UnitIcon + token-styled hull/shield bars)
│           ├── unit-sprite.tsx             # NEW — a single unit at its tick state + event-driven VFX (motion-safe)
│           ├── contact-line.tsx            # NEW — center strip + tick-progress node (mockup)
│           ├── overall-stats.tsx           # NEW — per-side alive/hull/dmg + tick/time readout (mockup)
│           ├── playback-controls.tsx       # NEW — play/pause, speed, frame-step, jump, Skip-to-Outcome cluster
│           ├── scrubber.tsx                # NEW ("use client") — the WAI-ARIA media-seek slider (O(1) seek) + marker overlay
│           ├── timeline-markers.tsx        # NEW — Plan-B/death markers over the track (activatable, labelled)
│           └── game-selector.tsx           # NEW — Bo3 GAME 1/2/3 tabs
├── public/icons/*.svg                      # EXISTING — the 7 unit SVGs UnitIcon inlines
└── e2e/battle-playback.spec.ts             # NEW — Playwright: scrub/seek, speed, markers, both orientations, a11y, reduced-motion
```

**Structure Decision**: A **route under the Feature 3 authenticated shell**
(`app/(app)/battle/[matchId]/`) whose Server Component fetches + gates the Replay and hands
it to a single `"use client"` **`BattlePlayer`**; all playback UI lives under
`src/components/battle/` (matching Feature 3's `src/components/*` convention), and the reader
is extended by a **pure, engine-free `src/sim/replay-view.ts`** — never by adding simulation.
The `BattleStage`-over-`PlayerState` seam keeps the renderer swappable (the Canvas escape
hatch, research A2) without touching the loop/seek logic. `"use client"` is pushed to the
interactive player leaf; the page stays a Server Component ([`stacks/nextjs.md`](../../stacks/nextjs.md)).

## Complexity Tracking

*No constitution deviations require justification.* This feature **adds no new runtime
dependency** — it composes the existing stack (React 19 + Tailwind v4 + Feature 3 + Feature
1's reader). The one architecturally-notable choice is a *decline*, not an addition:
**rejecting a GPU renderer (PixiJS/`@pixi/react`) in favor of DOM/CSS**, which *reduces*
complexity and bundle while fully satisfying the ask (research A1) — the simpler compliant
path, recorded for visibility rather than as a violation.

| Consideration | Decision | Simpler / alternative path and why not it |
|---|---|---|
| GPU renderer (Pixi/WebGL) vs **DOM/CSS sprites** | **DOM/CSS** | A GPU renderer is built for 1000+ sprites; at ≤10 discrete-zone units it adds ~450 KB, a parallel a11y/responsive burden, and re-implements Feature 3's `UnitIcon`/tokens — pure over-engineering (Principle IV). DOM is the smallest thing that fully satisfies P7 + a11y + reuse. Canvas 2D is kept as a documented escape hatch behind the `BattleStage` seam. |
| Sub-tick interpolation of battle state vs **integer-tick truth + CSS smoothing** | **Integer-tick + CSS** | Blending `snapshots[t]↔[t+1]` would fabricate non-authoritative state (a P6 concern) for a model with no free motion; CSS transitions give the same perceived smoothness with zero model risk and keep seek trivially O(1). |

## Post-Design Constitution Re-check

After Phase 1 (data-model, contracts): **still PASS.**
- The data model keeps **PlayerState client-only/ephemeral** and the rendered frame a **pure
  function of `(gameIndex, currentTick)`** over the immutable decoded Replay → P6/P8 hold
  (no fabricated state, no engine, data-driven).
- The `battle-view` contract keeps the reader-extension (`replay-view.ts`) **engine-free**
  and makes seek a single `snapshotAt` index → SC-003/SC-005 (O(1), engine-never-called) are
  structural, and the `BattleStage` seam keeps the renderer swappable without touching seek.
- The component contract keeps every surface **token-only** (Feature 3) and the scrubber on
  the **WAI-ARIA media-seek** pattern with a reduced-motion baseline → SC-004/SC-008/SC-009,
  and **P7** is satisfied by the responsive DOM layout, not traded.
- No new complexity surfaced during design; the two tracked considerations above are
  unchanged. The never-waived invariants **P6** and **P7** are satisfied structurally.

## Phase status

- [x] **Phase 0 — Research** → [research.md](./research.md) (all unknowns resolved)
- [x] **Phase 1 — Design & contracts** → [data-model.md](./data-model.md),
  [contracts/battle-view.md](./contracts/battle-view.md)
- [ ] **Phase 2 — Tasks** → `tasks.md` via `/speckit-tasks` (next)
