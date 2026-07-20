# Implementation Plan: Battle Summary

**Branch**: `006-battle-summary` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-battle-summary/spec.md`

## Summary

Build the **post-match Battle Summary screen** — a legible read-out of an already-resolved best-of-three.
It is a **presentation/reporting screen with no engine and no replay player**: it fetches a resolved
`MatchResult` (+ the replay reference and the ladder-standing delta) via Feature 7, derives a **pure,
display-only ViewModel** that represents every `MatchResult` field, and renders it with the Feature 3 app
shell, tokens, and primitives — first-class in **both orientations** (constitution **P7**).

There are no hard problems here; the determinism and result shape were solved in Feature 1 and the visual
system in Feature 3. The two genuine design questions, both resolved in [research.md](./research.md), are
**seams and layout**: (1) *how the summary links out* — to the replay (Feature 5), the next opponent
(Feature 8), and the ladder delta (Feature 7/9), kept high-level; and (2) *the responsive both-orientation
layout* for a dense results screen (portrait single-scroll vs landscape multi-column), grounded in the
mockup. A minor data seam — sourcing the optional MVP / per-machine damage from the linked replay's events
without re-simulating — is also settled.

## Technical Context

**Language/Version**: **TypeScript** on **Next.js 16 App Router** + **React 19** (the existing repo-root
app). No Rust/WASM in this feature — it consumes Feature 1's *output*, not its engine.

**Primary Dependencies**: the **Feature 3 design system** (`src/components/ui|shell|brand`, `app/globals.css`
tokens, Tailwind v4); Feature 1's **TypeScript result types** (the `MatchResult`/`GameResult`/`BattleResult`
mirror + the `Replay` `meta.unitOrder`, from `src/sim/`); Feature 7's **read path** for the persisted result
+ replay reference + standing delta. No new runtime libraries.

**Storage**: **N/A to this feature.** It *reads* the `MatchResult`/replay/standing via Feature 7
([Accounts & Persistence](../007-accounts-persistence/spec.md)); it designs no schema. The replay-format and
result shapes it binds to are Feature 1 contracts
([replay-format](../001-battle-sim-core/contracts/replay-format.md)).

**Testing**: **Vitest** (or the repo's unit runner) for the pure ViewModel derivation (SC-001/002/003/005/
006) and **Playwright** for both-orientation render + reduced-motion + action-seam tests (SC-004/007/008),
matching Feature 3's testing approach.

**Target Platform**: the **web app** on Vercel — a Server-Component route in the authenticated app group,
rendered on both mobile portrait and desktop landscape (P7). No engine host context here.

**Project Type**: a **screen feature** (web) composing Feature 3's shell/primitives over Feature 1's result
data — the same shape as the other screen features (4, 5, 8, 9, 10).

**Performance Goals**: instant render — the ViewModel derivation is an O(1)-in-games / O(10)-in-machines
pure transform of an already-resolved result; the optional MVP derivation is a single O(events) reduction
over the replay (only if per-machine damage isn't in the result). No simulation, no heavy compute.

**Constraints**: **no engine, no re-simulation, no tick playback** (that is Feature 1 / Feature 5); **token-
only styling** (no raw hex, Feature 3 SC-002); **both orientations first-class** with zero horizontal scroll
320px→ultra-wide (P7); **server-authoritative data** — the result and standing are read from the server,
never fabricated or recomputed on the client (P6).

**Scale/Scope**: one route + ~8 presentational components + one pure derivation module + its tests. Bounded
by a 5v5, ≤3-game, 4-zone result. Not the replay player, not the ladder, not persistence, not matchmaking.

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1 design. Constitution v3.0.0 — Product
Invariants P1–P8 + Engineering Process I–IX.*

### Product & Architecture Invariants

| Invariant | Status | How this plan satisfies it |
|---|---|---|
| **P1 Non-P2W by construction** | ✅ (N/A) | A read-out screen sells and grants nothing; it displays the reward **tier** (Full/Lesser) as a legibility label (§9.3), which has no v1 economic effect (§16.1). No power, no purchase surface. |
| **P2 Planning over twitch** | ✅ | The summary rewards *reading the plan's outcome* — win condition, per-machine fates, damage exchange — reinforcing that the match was decided by pre-battle decisions, not twitch. It adds no real-time input. |
| **P3 Depth from configuration** | ✅ (N/A) | No content axes added; it reflects the existing 7×3×equipment×dials×placement outcome. |
| **P4 Fairness is verified** | ✅ (enabling) | By surfacing win condition, reward tier, and per-machine fates legibly, the summary makes an individual match's fairness *observable* to the player — complementary to the balancer's statistical proof (Feature 2). |
| **P5 Content from players/puzzles** | ✅ (N/A) | Displays outcomes of async-PvP matches against player/seeded defenses; introduces no content pipeline. |
| **P6 Deterministic, server-authoritative (NON-NEG)** | ✅ | The summary reads the **authoritative** result resolved server-side and persisted (Feature 7); it **never** re-simulates, recomputes the winner, or lets client state alter the outcome. Totals shown reconcile from the result (SC-003), which itself reconciles from the tick stream (Feature 1 SC-002). |
| **P7 Both platforms first-class (headline)** | ✅ | **The core UI obligation.** Portrait (360px) = single-scroll stacked panels designed *for* the phone; landscape (1440px) = multi-column designed *for* the desktop — neither adapted grudgingly from the other. Verified both-orientation (SC-004). |
| **P8 Data-driven content** | ✅ | It binds to Feature 1's **single typed result schema** (reused, not reduplicated) and Feature 3's semantic tokens — the same sources the sim, Garage, and balancer read. Adding/altering a result field flows through the shared types. |

### Engineering Process (I–IX)

| Principle | Status | Note |
|---|---|---|
| **I Clarify** | ✅ | Prioritized, independently-testable stories; explicit non-goals (replay player, engine, ladder, persistence, matchmaking); zero open `NEEDS CLARIFICATION`. Judgment calls recorded in Assumptions/research. |
| **II Validated trust boundaries** | ✅ | The result and standing are **read server-side** and never trusted from the client; the render is defensive over every enumerated result shape (FR-018). This screen introduces no new write/trust boundary. |
| **III Match conventions** | ✅ | Composes Feature 3's shell/tokens/primitives and Feature 1's result types; follows [`stacks/nextjs.md`](../../stacks/nextjs.md) (Server Components by default, client leaves for interaction) and the established `src/components/*` conventions. |
| **IV Scope discipline (NON-NEG)** | ✅ | Smallest complete slice: one screen that *reads and renders* a result. Replay playback, ladder, persistence, matchmaking, MMR/tiers all explicitly out. MVP is a graceful enhancement, not a scope expansion. |
| **V Verify before done** | ✅ | Eight SC checks are executable — a unit test proving full-field representation + totals-equality over a fixture battery, and Playwright both-orientation/reduced-motion/action-seam tests. |
| **VI Narrate** | ✅ | research.md records the seam + layout + data decisions with rationale and rejected alternatives. |
| **VII Plan whole set first** | ✅ | Part of the full-project planning pass; this plan surfaces the Feature 1 result-shape and Feature 7 read-path dependencies on paper before any screen is built. |
| **VIII Test at right level** | ✅ | **Unit** for the pure ViewModel derivation (the logic with real signal — every field, the tie/tier/defeat/wipe cases); **e2e (Playwright)** for the both-orientation render and action seams a unit test can't reach. |
| **IX Commit atomically, branch per feature** | ✅ | On `006-battle-summary`; planning artifacts commit atomically; implementation follows on this branch. |

**Gate result: PASS.** No deviations; no Complexity Tracking entries required. P1 and P6 are satisfied
without trade-off (a reader screen sells nothing and fabricates nothing).

## Project Structure

### Documentation (this feature)

```text
specs/006-battle-summary/
├── plan.md              # this file
├── spec.md              # user stories, FRs, SCs
├── research.md          # Phase 0 — the seam + layout + data-source decisions
├── data-model.md        # Phase 1 — the BattleSummaryViewModel + the MatchResult→display derivation map
├── contracts/
│   └── view-model.md    # Phase 1 — the ViewModel TS shape + deriveSummaryViewModel() + page props contract
└── tasks.md             # Phase 2 — created by /speckit-tasks (next step)
```

### Source Code (repository root)

The existing Next.js app lives at the **repo root**. This feature adds one authenticated route and a small
component + derivation module set under the existing `app/` and `src/` trees — no restructuring. It imports
Feature 3's design system and Feature 1's result types; it reads Feature 7's data layer.

```text
d:/Codelib/warformcommander/
├── app/(app)/matches/[matchId]/summary/
│   ├── page.tsx                     # NEW — Server Component: fetch MatchResult + replay ref + standing (Feature 7),
│   │                                #        derive the ViewModel, render the summary inside the Feature 3 shell
│   ├── loading.tsx                  # NEW — skeleton while the result is fetched
│   └── error.tsx                    # NEW — result-not-found / unsupported-result fallback
├── src/components/battle-summary/   # NEW — the screen's presentational components (Feature-3-token-driven)
│   ├── outcome-hero.tsx             #   VICTORY/DEFEAT verdict + "BEST OF 3" eyebrow + opponent + series pips + standing delta
│   ├── series-pips.tsx             #   per-game W/L pills (G1/G2/G3) — the 2-0 / 2-1 indicator
│   ├── match-totals.tsx             #   the you-vs-them comparison bars (damage / units killed / lost / avg hull)
│   ├── game-breakdown.tsx           #   per-game cards: W/L, CONQUEST|TIME, FULL|LESSER, survivors, duration
│   ├── per-machine-fates.tsx        #   the 10 machines: destroyed-at-tick | survived-with-hull%, via UnitIcon + unitOrder
│   ├── mvp-card.tsx                 #   optional MVP (top damage/kills/absorbed); omitted if data unavailable
│   ├── standing-delta.tsx           #   net-victory change (+delta, before→after) | "UNRANKED" for practice
│   └── summary-actions.tsx          #   Watch Replay (→ Feature 5) · Find Next Opponent (→ Feature 8) · Back
├── src/lib/battle-summary/
│   ├── view-model.ts                # NEW — deriveSummaryViewModel(result, ctx): pure, total; the SC-001/003 core
│   ├── view-model.test.ts           # NEW — unit tests: full-field representation, totals-equality, tie/tier/defeat/wipe
│   └── format.ts                    # NEW — small pure helpers: ticks→seconds, survivors→killed/lost, avg-hull
├── src/sim/                         # EXISTING (Feature 1) — result types + Replay meta consumed here (import only)
├── src/components/{ui,shell,brand}/ # EXISTING (Feature 3) — Panel/StatBar/Stat/Chip/Button/SectionLabel/UnitIcon/AppShell
└── e2e/battle-summary.spec.ts       # NEW — Playwright: 360px portrait + 1440px landscape + reduced-motion + action seams
```

**Structure Decision**: A **single authenticated route** at `app/(app)/matches/[matchId]/summary/` (a
Server Component that fetches the result via Feature 7 and derives the ViewModel server-side), a **set of
token-driven presentational components** under `src/components/battle-summary/`, and a **pure derivation
module** under `src/lib/battle-summary/` that is the unit-testable heart of the feature (it holds all the
logic; the components are thin). This mirrors the Feature 3 component conventions and the `stacks/nextjs.md`
"Server Components by default, client leaves for interaction" default — the summary is almost entirely
server-rendered; only the action controls (navigation) need client behavior, and even those can be
`next/link`. The route path deliberately keys on `matchId` so the **Watch Replay** and result fetch both
resolve from one identifier that Feature 7 owns.

## Complexity Tracking

> No constitutional deviations. This feature composes existing systems (Feature 1 result types, Feature 3
> design system, Feature 7 read path) and introduces one pure display ViewModel. No new toolchain, no new
> dependency, no P1/P6 trade-off. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| *(none)* | — | — |

## Post-Design Constitution Re-check

After Phase 1 (data-model + view-model contract): **still PASS.**
- The ViewModel is a **pure, total** transform that represents every `MatchResult` field (SC-001) and
  reconciles totals exactly (SC-003) → P6/P8 hold; the client neither re-simulates nor recomputes the
  winner.
- The contract keeps the summary a **reader**: the replay is *referenced* (Feature 5 hand-off), never
  played here; the standing delta is *read* (Feature 7), never computed → P6 and the Feature 4/5/7/8/9
  scope boundaries hold.
- The layout decision (portrait single-scroll / landscape multi-column, both grounded in the mockup) keeps
  **P7** first-class with no horizontal overflow → SC-004.
- No new complexity surfaced; Complexity Tracking stays empty.

## Phase status

- [x] **Phase 0 — Research** → [research.md](./research.md) (seams + layout + data-source resolved)
- [x] **Phase 1 — Design & contracts** → [data-model.md](./data-model.md),
  [contracts/view-model.md](./contracts/view-model.md)
- [ ] **Phase 2 — Tasks** → `tasks.md` via `/speckit-tasks` (next)
