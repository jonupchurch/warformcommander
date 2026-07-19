# Implementation Plan: Garage — Squad Builder + Loadout/Dial Editor

**Branch**: `004-garage` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-garage/spec.md`

## Summary

Build the **Garage** — the screen where a player authors the plan (constitution **P2**): assemble a
**5-unit squad** (type + variant), kit each machine (**1 weapon / 1 defense / 3 utility**,
mount/family-gated), dial in its **4 behavior dials + ≤2 Plan-B triggers**, and **place** it across
the four zones, under a **live effective-stat + power-rating preview** and a **hard validation
gate** that rejects any illegal build with a reason. It is a **composition layer**, not a new source
of truth: it edits **Feature 1 types**, composes **Feature 3 primitives**, saves through **Feature
7's service**, and rejects exactly the builds the engine would by calling the **same shared
`validate()`** (**P8**).

The three hard problems, all resolved in [research.md](./research.md): **(1) a deeply-nested config
editor** (5 machines × ~12 decisions) — a scoped `useReducer` (+ Immer) over a normalized draft
tree with the preview/validation **derived during render** (memoized), no `useEffect`-into-state;
**(2) a placement + dense-editor UX that is co-equally first-class in portrait and landscape**
(**P7**) — **tap-to-select-then-tap-zone** (touch/mouse/keyboard, caps enforced by disabling
targets), a 3-column landscape rig that becomes stacked/tabbed panes in portrait, reusing Feature
3's media-macro / container-micro law; and **(3) the client/server validation trust boundary** —
the **same** `validate()` runs client-side for instant feedback (convenience) and **server-side
inside Feature 7's write path** as the sole authority (**Principle II**, A4). The client never runs
the WASM engine (**P6**) and never touches the DB (all writes are Feature 7 Server Actions).

## Technical Context

**Language/Version**: **TypeScript** on **Next.js 16** (App Router, Turbopack), **React 19** — no
new language surface (contrast Feature 1's Rust). CSS via **Tailwind CSS v4** (Feature 3 tokens).

**Primary Dependencies**: Feature 3's design system (`AppShell`/`PrimaryNav`, `UnitIcon`, `StatBar`,
`Stat`, `Panel`, `Chip`, `Button`, `SectionLabel`, `Menu`/`Dropdown`, `Dialog`/`Sheet`, faction/
zone/family tokens); Feature 1's **shared TS surface** `src/sim/` (`validate()`,
`deriveEffectiveStats()`, `unlockedCapabilities()`, the game types); Feature 7's **service**
`src/server/` (`saveSquad`/`updateSquad`/`designateDefense`/`savePreset`, …). New runtime deps kept
minimal: **`immer`** (nested draft updates) and **optionally `@dnd-kit/*`** (drag as a *progressive
enhancement* over tap-to-place, [research B1](./research.md)). Dev/test: `@playwright/test` +
`@axe-core/playwright` (present per Feature 3), Vitest/Jest for reducer + parity unit tests.

**Storage**: **N/A to the Garage directly** — it persists **nothing** itself. All reads/writes go
through **Feature 7's service** (Neon Postgres + Drizzle, server-side). The Garage holds a
**client-only editor view-model** ([data-model.md](./data-model.md)) that is never persisted; on
save it projects to a Feature 1 `SquadConfig` handed to Feature 7.

**Testing**: **Playwright** e2e for the golden path (assemble → kit → dial → place → save),
**reject-illegal** (each V1–V8 case surfaces a reason and blocks save), the **few-taps-to-legal-
squad** on-ramp (SC-004), and the **both-orientation** matrix (360×640 / 1440×900 / 320px min,
no-horizontal-scroll — SC-003). **Unit** tests for the reducer transitions, the **engine-parity**
of the client preview (`deriveEffectiveStats` client == engine — SC-002), and that **save is gated
by `validate()`** (a known-illegal config cannot persist — SC-005). `@axe-core/playwright` on the
Garage + Customize surface.

**Target Platform**: The **browser**, both **mobile portrait AND desktop landscape as co-equal
first-class targets** (**P7**) — the defining constraint of the densest screen. Deployed on Vercel.

**Project Type**: A **screen feature inside the existing repo-root Next.js app** — an authenticated
route under `app/(app)/garage/`, its components under `src/components/garage/`, its client editor
state under `src/lib/garage/`. Consumes Feature 1 (`src/sim`), Feature 3 (`src/components/{ui,brand,
shell}`), and Feature 7 (`src/server`). No new sub-app, no restructuring.

**Performance Goals**: Live preview re-derivation stays imperceptible on every edit (memoized to the
changed machine's config slice; `useTransition` if a full-squad re-derive ever janks —
[research A2](./research.md)); **no horizontal page scroll** at any width 320px→ultra-wide (SC-003);
the interactive editors are small `"use client"` leaves so the shell/read-only panes stay cheap.

**Constraints**: **P7 is the hard constraint** (both orientations designed *for*, SC-003).
**Principle II / A4** — the client preview is convenience, the **server `validate()` is the sole
authority** (SC-005); nothing illegal ever persists (SC-001). **P8** — the client preview reuses
Feature 1's shared derivation, never a Garage formula (SC-002). **Token-only styling** — no raw
brand hex, compose Feature 3 primitives (FR-020). The client **never** runs the WASM engine (**P6**)
and **never** touches the DB (all writes via Feature 7 Server Actions).

**Scale/Scope**: The Garage screen + its Customize editor + the defense-designation surface + a
**representative stock-preset catalog** (enough to seed the on-ramp and the tests, not an exhaustive
library — mirrors Feature 1's "representative subset" stance). **Not** the engine, persistence
internals, battle running, playback, or matchmaking (spec Non-goals; Principle IV).

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1 design. Constitution v3.0.0 —
Product Invariants P1–P8 + Engineering Process I–IX.*

### Product & Architecture Invariants

| Invariant | Status | How this plan satisfies it |
|---|---|---|
| **P1 Non-P2W by construction** | ✅ | The loadout editor presents every weapon/defense as a **mount-gated trade-off** and makes the **native-family bonus cost** legible (off-family works but forgoes the bonus) — it *shows* the sidegrade, never a strict upgrade (FR-006). It sells/gates nothing; Power Rating is displayed as matchmaking-only, never combat (FR-014). |
| **P2 Planning over twitch** | ✅ **the screen's whole purpose** | The Garage is where **pre-battle decisions** live — composition, loadouts, dials, placement. No twitch/real-time input; the player authors a plan the engine later resolves. This *is* "skill lives in the plan." |
| **P3 Depth from configuration** | ✅ | The editor exposes the orthogonal axes — type × variant × equipment × 4 dials × ≤2 Plan-B × placement — as configuration, not roster count; the density is the depth (US2/US3), kept legible by presets (US4). |
| **P4 Fairness is verified** | ✅ (N/A here) | The Garage authors builds; the balancer (Feature 2) verifies fairness. No balance surface here. |
| **P5 Content from players/puzzles** | ✅ (enabling) | Defense **designation** (US5) is what turns a player's saved squad into the async-PvP content the ladder serves — the Garage is where that content is authored and designated. |
| **P6 Deterministic, seeded, server-authoritative (NON-NEG)** | ✅ | The client **never runs the WASM engine** and **never writes the DB** — it previews with pure shared functions and persists through Feature 7's **server-authoritative** write path; the server `validate()` is the authority. No client-fabricated result surface. |
| **P7 Both platforms first-class (NON-NEG for this feature)** | ✅ **the headline challenge** | One screen, **two co-equal layouts** — 3-column landscape / stacked-tabbed portrait; tap-to-place works in both; SC-003 verifies the full flow at 360px and 1440px. The densest UI in the game is designed *for* both, not adapted ([research B1/B2](./research.md)). |
| **P8 Data-driven content** | ✅ | The Garage **reuses Feature 1's typed model and shared `validate()`/derivation** — one source of truth for sim, UI, and balancer; the client preview must **equal** the engine's derivation (SC-002). It defines no game types (FR-021). |

### Engineering Process (I–IX)

| Principle | Status | Note |
|---|---|---|
| **I Clarify** | ✅ | Spec has prioritized, independently-testable stories, acceptance scenarios, an explicit edge-case list, and stated non-goals; zero open `NEEDS CLARIFICATION`. Judgment calls recorded in Assumptions. |
| **II Validated trust boundaries** | ✅ **central** | Shared `validate()`: client = instant feedback (convenience), **server-side in Feature 7 = authority** (A4); the Garage trusts no client state for persistence and re-checks nothing for authz (Feature 7 owns A1/A2). [research C1/C2](./research.md). |
| **III Match conventions** | ✅ | Composes Feature 3's established primitives/tokens and the shadcn-idiomatic `src/components/**` + `cn()` layout; follows [`stacks/nextjs.md`](../../stacks/nextjs.md) (Server Components default, Server Actions for mutations). No new pattern invented. |
| **IV Scope discipline (NON-NEG)** | ✅ | Only the squad builder + loadout/dial editor + defense designation. Engine (F1), persistence internals (F7), running battles (F8), playback (F5), summaries (F6) all explicitly **out** (spec Non-goals); stock-preset *authoring* kept light. |
| **V Verify before done** | ✅ | SC-001..006 are executable (Playwright golden-path/reject-illegal/both-orientation + parity + save-gated-by-validate + designation-safety); "done" = green across the viewport matrix + `next build` + typecheck. |
| **VI Narrate** | ✅ | research.md records every decision + rejected alternatives with sources; the cross-feature dependency is named, not silently assumed. |
| **VII Plan whole set first** | ✅ | Planned in the foundation-first pass; this plan **surfaces the cross-feature dependency** that Feature 1's shared TS surface must export `deriveEffectiveStats()`/`unlockedCapabilities()` (Complexity Tracking) — exactly the collision Principle VII exists to surface on paper. |
| **VIII Test at right level** | ✅ | Unit (reducer transitions, engine-parity of the preview, save-gated-by-validate); e2e (Playwright — the responsive dense flow a unit test can't reach: build-a-squad, reject-illegal, both-orientation, on-ramp). |
| **IX Commit atomically, branch per feature** | ✅ | On `004-garage`; artifacts + implementation commit atomically per phase/story. |

**Gate result: PASS.** One tracked cross-feature dependency (below). No P1/P6/P7 concerns — P7 (the
never-waived invariant in play here) is the feature's core and satisfied by design.

## Project Structure

### Documentation (this feature)

```text
specs/004-garage/
├── plan.md              # this file
├── spec.md              # prioritized stories, FRs, edge cases, success criteria
├── research.md          # Phase 0 — editor state, placement UX, validation trust boundary
├── data-model.md        # Phase 1 — the client editor view-model (game types reused from Feature 1)
├── contracts/
│   └── editor-state.md  # Phase 1 — the shared-fn/service boundary + editor state machine + composed components
└── tasks.md             # Phase 2 — created by /speckit-tasks (next)
```

### Source Code (repository root)

The existing Next.js app is at the **repo root**. This feature adds a route under the authenticated
group `app/(app)/` (owned by Feature 3's shell) and its components/state under `src/`. It imports
Feature 1 (`src/sim`), Feature 3 (`src/components/{ui,brand,shell}`, `src/lib/utils`), and Feature 7
(`src/server`) — defining none of them.

```text
d:/Codelib/warformcommander/
├── app/(app)/
│   └── garage/
│       ├── page.tsx                 # NEW — Garage screen (Server Component): loads roster via Feature 7, renders GarageLayout
│       ├── loading.tsx              # NEW — skeleton while the roster loads
│       └── (the (app) layout = Feature 3 AppShell; not owned here)
├── src/
│   ├── components/garage/           # NEW — screen composites over Feature 3 primitives (contracts/editor-state.md §5)
│   │   ├── garage-layout.tsx        # 3-col landscape ↔ stacked/tabbed portrait (P7; research B2)
│   │   ├── squad-rail.tsx           # left rail: saved squads, PWR/W-L, ACTIVE, + NEW SQUAD
│   │   ├── formation-board.tsx      # ("use client") center: zone rows, tap-to-select-then-place (research B1)
│   │   ├── zone-row.tsx             # one zone: cap label, occupancy, disabled-when-full/off-home
│   │   ├── unit-detail-panel.tsx    # right: 7 StatBars, loadout rows, dial tiles, Customize CTA
│   │   ├── customize-surface.tsx    # ("use client") Sheet (portrait) / side-panel (landscape) host
│   │   ├── loadout-editor.tsx       # ("use client") weapon/defense/utility pickers, mount/family-gated (US2)
│   │   ├── dial-editor.tsx          # ("use client") 4 dials, capability-gated options (US3)
│   │   ├── planb-editor.tsx         # ("use client") ≤2 triggers, slot-2 gated, Slot-1>Slot-2 (US3)
│   │   ├── preset-picker.tsx        # ("use client") apply stock/custom, save custom (US4)
│   │   ├── defense-panel.tsx        # ("use client") designate ≤3 / undesignate / re-designate (US5)
│   │   └── validation-notice.tsx    # renders a ValidationError.reason against a slot/zone (FR-016)
│   ├── lib/garage/                  # NEW — the client editor state machine (research A1)
│   │   ├── editor-reducer.ts        # pure garageReducer(session, action) — unit-tested
│   │   ├── use-garage-editor.ts     # ("use client") context hook: dispatch + memoized preview/validation + save/designate
│   │   ├── to-squad-config.ts       # DraftSquad → Feature 1 Squad/SquadConfig projection (single projection point)
│   │   └── preset-catalog.ts        # STOCK presets as static typed game data, per MachineType (research B3)
│   ├── sim/                         # EXISTING (Feature 1 TS surface) — import validate()/deriveEffectiveStats()/types
│   ├── server/                      # EXISTING (Feature 7 service) — import saveSquad/designateDefense/savePreset/…
│   └── components/{ui,brand,shell}/ # EXISTING (Feature 3) — Panel/Chip/StatBar/Stat/Button/UnitIcon/AppShell/…
└── e2e/ (or tests/)                 # NEW — Playwright: build-a-squad, reject-illegal, on-ramp, both-orientation, axe
```

**Structure Decision**: A **screen feature added in place** to the repo-root app. The route drops
into Feature 3's authenticated `app/(app)/` group (inheriting the shell chrome for free); the
**client editor state** is isolated under `src/lib/garage/` (a scoped context, not a global store);
the **screen composites** under `src/components/garage/` compose Feature 3 primitives only. The
Garage owns **no** game types (`src/sim` = Feature 1), **no** persistence (`src/server` = Feature
7), and **no** design primitives (`src/components/{ui,brand,shell}` = Feature 3) — it is the layer
that assembles them into an editor. This mirrors how Feature 1 and Feature 3 added alongside the app
without restructuring it.

## Complexity Tracking

*No constitution deviations require justification.* The one item worth tracking is a **cross-feature
dependency** surfaced by this plan (the value of Principle VII), not a complexity violation:

| Item | Decision | Why / simpler alternative rejected |
|---|---|---|
| **Feature 1's shared TS surface must export `deriveEffectiveStats()` + `unlockedCapabilities()`, not only `validate()`** | Add them to **Feature 1's** shared `src/sim/` surface (with an engine-parity test), and have the Garage consume them | Feature 1 data-model already defines derivation as "a shared function the engine, Garage, and balancer all call," but its task T033 only commits the *validation* mirror. A **Garage-local** stat/capability reimplementation would be the exact drift **P8** forbids and would make SC-002 (preview == engine) meaningless. Recording it here surfaces the collision on paper (Principle VII) so Feature 1's build includes it. |
| **`immer` (nested draft updates); optional `@dnd-kit` (drag enhancement)** | Adopt `immer`; treat drag as a progressive enhancement over tap-to-place, not a dependency the baseline needs | Hand-written immutable spread surgery over a 5×~12 tree is error-prone; `immer` is the mainstream remedy. Drag-only placement would fail P7 (touch/keyboard/AT) — tap-to-place is the guaranteed-accessible baseline; `@dnd-kit` is added only if it measurably helps landscape ([research B1](./research.md)). |

*P1, P6, and P7 (the never-waived invariants in play) are fully satisfied, not traded.*

## Post-Design Constitution Re-check

After Phase 1 (data-model, contract): **still PASS.**
- The **data-model** keeps every game type in Feature 1 and every table in Feature 7 — the Garage
  owns only a **client, never-persisted** view-model → **P8** holds (one source of truth).
- The **editor-state contract** fixes the trust boundary — client `validate()` = convenience,
  server-side `validate()` in Feature 7 = authority (A4) → **Principle II / P6** hold; nothing
  illegal persists (SC-001/SC-005).
- The preview is derived from Feature 1's shared derivation and asserted equal to the engine
  (SC-002) → **P8**; the responsive rig fixes two co-equal layouts → **P7**/SC-003.
- No new complexity surfaced; the single tracked cross-feature dependency is unchanged.

## Phase status

- [x] **Phase 0 — Research** → [research.md](./research.md) (all unknowns resolved)
- [x] **Phase 1 — Design & contracts** → [data-model.md](./data-model.md), [contracts/](./contracts/)
- [ ] **Phase 2 — Tasks** → `tasks.md` via `/speckit-tasks` (next)
