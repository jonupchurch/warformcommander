# Implementation Plan: Ladder

**Branch**: `009-ladder` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-ladder/spec.md`

## Summary

Build the **Ladder screen** — Warform Commander's public async-PvP ranking — as a **read-only view**
over the persistence substrate [Feature 7](../007-accounts-persistence/data-model.md) already ships.
It renders a leaderboard **ordered by net victories** (`attackWins − defenseLosses`, design §13), each
commander's **record / streak / total damage**, the **viewer's own rank**, and **per-period** (week /
month) rollups from `matches` — through the [Feature 3](../003-app-shell/spec.md) shell + design
system, **first-class in both orientations** (P7). It also **explains the net-victory model** (why a
weak defense bleeds rank), the design's whole v1 stake.

The board reads `ladder_standings` (season/all-time) and rolls up `matches` (per-period) via a
Feature-9 **read-only** query module plus Feature 7's existing `getLeaderboard`/`getStanding`. The
two design problems, both settled in [research.md](./research.md): **(A)** a dense leaderboard that is
first-class in portrait *and* landscape — solved by **two purpose-built layouts** (landscape table /
portrait card list) toggled by `lg:` and a **pinned viewer-standing card** for own-rank locatability;
and **(B)** a **live-ish** board on Next 16 — solved by rendering server-side with the **shared board
cached** (short revalidation) and the **per-viewer overlay dynamic** (never cross-user cached).

**Seasons / tiers / MMR / trend from the mockup are DEFERRED** (§13) — presentational chrome only in
v1; the ranking stake is net victories, and the season **schema seam** Feature 7 noted is named, not
built (Principle IV).

## Technical Context

**Language/Version**: **TypeScript** on **Next.js 16** (App Router, React 19) — the existing app at the
repo root. No new language.

**Primary Dependencies**: Next 16 (Server Components, Cache Components / `use cache`), the
[Feature 3](../003-app-shell/contracts/components.md) design system (tokens + `Panel`/`Chip`/
`SectionLabel`/`Button`/`UnitIcon`), and the [Feature 7](../007-accounts-persistence/contracts/persistence-api.md)
persistence service (`getLeaderboard`/`getStanding`) + shared `getDb()` for the read-only ladder
queries. No new runtime dependency.

**Storage**: **None new** — reads Feature 7's `ladder_standings`, `matches`, `users` (Neon Postgres +
Drizzle via postgres-js). This feature never writes; a read-only composite **index** on
`(net_victories DESC, total_damage DESC, user_id)` is recommended for keyset paging (research C, a
read-side refinement, not a schema/write change).

**Testing**: **Vitest** (repo standard, per [Feature 7 tasks](../007-accounts-persistence/tasks.md))
for the ranking-order / tiebreak / defense-loss / period-rollup / view-model unit+integration tests
against a Neon dev-branch test DB; **Playwright** for the both-orientation e2e (per
[Feature 3](../003-app-shell/tasks.md)).

**Target Platform**: The browser (both orientations, P7) served by Next 16 on Vercel; server reads run
in the Node/Server-Component context.

**Project Type**: A **screen feature** — a route + components under the existing app, plus a read-only
server query module. No sub-app, no engine, no new service.

**Performance Goals**: The leaderboard renders server-side within a normal request budget; the shared
board is cached (~30–60s revalidation) so it does not re-query per hit; no horizontal page scroll and a
legible board at 360×640 and 1440×900 (SC-003).

**Constraints**: **Read-only** (FR-015, P6) — no standings/matches writes, no client DB access; order is
an **exact, deterministic** function of stored standings with a defined tiebreak (SC-001/SC-005); the
per-viewer highlight is **never cross-user cached** (research B1).

**Scale/Scope**: The `/ladder` route, the read-only query module (season board + period rollup + viewer
rank), the two responsive layouts, the podium, the metric/range controls, the net-victory explainer, and
their tests. **Out**: standings maintenance/matchmaking/Profile/seasons-MMR-tiers (see spec FR-016).

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1 design. Constitution v3.0.0 — Product
Invariants P1–P8 + Engineering Process I–IX.*

### Product & Architecture Invariants

| Invariant | Status | How this plan satisfies it |
|---|---|---|
| **P1 Non-P2W by construction** | ✅ | The ladder ranks by **net victories** (offense + defense skill), never spend; it shows no purchasable power and (per design) ladder rewards are cosmetic/deferred. Nothing here creates a pay lever. |
| **P2 Planning over twitch** | ✅ | The ranking reflects **pre-battle planning** outcomes resolved async; no twitch input affects it. The board surfaces the result of the plan, not a reflex contest. |
| **P3 Depth from configuration** | ✅ (N/A) | Not a configuration surface — a read-only display of outcomes. No new content axes. |
| **P4 Fairness is verified** | ✅ | The order is a **deterministic, testable** function of stored standings with a defined tiebreak (SC-001); the net-victory model is made transparent to players (US4 explainer) — fairness surfaced, not hidden. |
| **P5 Content from players/puzzles** | ✅ | The ladder is the shop-window for player-generated defense content; **cold-start seeded bots are included** so it is **never empty** (FR-011, SC-008), the exact P5 guarantee. |
| **P6 Deterministic, seeded, server-authoritative (NON-NEG)** | ✅ | **Read-only**: standings are server-authoritative (Feature 7/8); the Ladder reads only through the server surface, **cannot write or fabricate** a standing, and never exposes DB access to the client (FR-015). |
| **P7 Both platforms first-class** | ✅ | **The headline responsive case**: a dense table (landscape) and a stacked card list (portrait), each designed *for* its orientation, no horizontal page scroll 320px→ultra-wide (FR-013, SC-003), verified at 360 *and* 1440. |
| **P8 Data-driven content** | ✅ | Reads the **one source of truth** (`ladder_standings`/`matches`); `netVictories` is Feature 7's **generated column** — the ladder re-derives no ranking math, avoiding drift (P8). |

### Engineering Process (I–IX)

| Principle | Status | Note |
|---|---|---|
| **I Clarify** | ✅ | Acceptance scenarios + explicit non-goals (FR-016); the two judgment calls (tiebreak rule, seasons/MMR deferral) are named in spec Assumptions. Zero `NEEDS CLARIFICATION`. |
| **II Validated trust boundaries** | ✅ | Reads go through Feature 7's authenticated server surface (no client DB); `searchParams` (metric/range/page) validated/clamped to known enums before use (research B2). |
| **III Match conventions** | ✅ | Composes Feature 3's shell/tokens/primitives; reuses `PrimaryNav`'s two-chromes responsive pattern; Server-Component-by-default ([`stacks/nextjs.md`](../../stacks/nextjs.md)); read module follows Feature 7's `src/server/` shape. |
| **IV Scope discipline (NON-NEG)** | ✅ | Net-victory ladder only; seasons/MMR/tiers/trend **named as deferred**, not built; matchmaking, Profile screen, and the standings write path all explicitly out (FR-016). |
| **V Verify before done** | ✅ | SCs are executable (Vitest order/tiebreak/defense-loss/period-rollup + Playwright both-orientation) + `next build`/typecheck/lint. |
| **VI Narrate** | ✅ | research.md + Assumptions record every decision and rejected alternative. |
| **VII Plan whole set first** | ✅ | Planned in dependency order on the Feature 7 substrate (foundation-first per STATUS.md), after 1/3/7. |
| **VIII Test at right level** | ✅ | Unit (view-model mapping, tiebreak), integration (ranking order, defense-loss-lowers-rank, period rollup vs recompute, bot toggle) via Vitest; e2e (both orientations, rank locatable) via Playwright. |
| **IX Commit atomically, branch per feature** | ✅ | On `009-ladder`; planning artifacts commit atomically; implementation follows. |

**Gate result: PASS.** One mild simplification is tracked below. No P1/P6 concerns — the feature is
strictly read-only.

## Project Structure

### Documentation (this feature)

```text
specs/009-ladder/
├── plan.md              # this file
├── spec.md              # the feature spec (stories, FRs, SCs, assumptions)
├── research.md          # Phase 0 — responsive leaderboard + rendering/caching + read placement
├── contracts/
│   └── ladder-read.md   # the read-only query surface + display view-model + ordering/tiebreak
└── tasks.md             # Phase 2 — created by /speckit-tasks (next step)
```

*(No `data-model.md`: this feature adds no persisted entity — it reads
[Feature 7's data-model](../007-accounts-persistence/data-model.md). The display view-model lives in
`contracts/ladder-read.md`.)*

### Source Code (repository root)

The existing Next.js app lives at the repo root. This feature adds the `/ladder` route (Feature 3
already stubbed `app/(app)/ladder/page.tsx`), the ladder components, and one **read-only** server
query module — no restructuring.

```text
d:/Codelib/warformcommander/
├── app/(app)/ladder/
│   ├── page.tsx                       # Server Component: reads getLadderPage + getViewerStanding, composes layout
│   └── loading.tsx                    # skeleton while dynamic/cached segments resolve
├── src/
│   ├── server/ladder/
│   │   ├── queries.ts                 # READ-ONLY: getLadderPage / getViewerStanding / getPodium
│   │   │                              #   (season → ladder_standings; week/month → matches rollup; viewer rank)
│   │   └── queries.test.ts            # Vitest: order==net desc + tiebreak, defense-loss-lowers-rank,
│   │                                  #   negatives/ties, new-player unranked, period==recompute, bot toggle
│   └── components/ladder/
│       ├── leaderboard.tsx            # orchestrator: renders table (lg) + card list (portrait) from one dataset
│       ├── ladder-table.tsx           # landscape table inside overflow-x-auto (hidden lg:block)
│       ├── ladder-row.tsx             # a table row (rank · commander · record · streak · net [+ metric])
│       ├── ladder-card-list.tsx       # portrait card list (lg:hidden)
│       ├── ladder-card.tsx            # a portrait card
│       ├── podium.tsx                 # top-3
│       ├── viewer-standing-card.tsx   # pinned "your standing" + rank (or "unranked" CTA)
│       ├── metric-tabs.tsx            # "use client" leaf → net/damage/defenses (updates searchParams)
│       ├── range-tabs.tsx             # "use client" leaf → season/week/month
│       ├── net-victory-explainer.tsx  # US4 explainer
│       ├── pagination.tsx             # keyset/offset page controls + "jump to my rank"
│       ├── view-model.ts              # pure toLadderRows / toViewerStanding mapping
│       └── view-model.test.ts         # Vitest: mapping, signed negatives, own-row flag
├── e2e/
│   └── ladder.spec.ts                 # Playwright: 360 portrait cards / 1440 landscape table, no h-scroll,
│                                      #   rank locatable ≤1 interaction, metric/range switch, Profile link
└── (existing app: app/(app)/layout.tsx [Feature 3 shell], db/, src/server/ [Feature 7], …)
```

**Structure Decision**: A **route + components** under the existing app, plus a **single read-only
server query module** (`src/server/ladder/`). The screen is a **Server Component** that reads through
Feature 7's service and the ladder read module, composes the Feature 3 primitives, and pushes only the
metric/range tab interactivity into small `"use client"` leaves ([`stacks/nextjs.md`](../../stacks/nextjs.md)).
No write path, no new persisted entity — it reads Feature 7 and links to Feature 10.

## Complexity Tracking

| Violation / deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Per-period (week/month) leaderboards computed live** as a windowed `GROUP BY` over `matches` per request, rather than a materialized per-period standings table | The per-period views (US3) are a core affordance and `matches` exists precisely for them (Feature 7). Live aggregation is correct at v1 scale and adds **no write path**. | A **materialized per-period standings table** was rejected for v1: it is a **write path** Feature 7/8 would own (encroaching on their standings-maintenance ownership) and a **drift risk** (a second cache to reconcile). It is the documented **escalation** only if live aggregation ever gets slow. |

*No other deviations. The feature is strictly read-only; P1 and P6 (the never-waived invariants) are
satisfied by construction (it cannot write or fabricate a standing). Seasons/MMR/tiers are **out of
scope**, not a complexity trade — named per Principle IV.*

## Post-Design Constitution Re-check

After Phase 1 (contracts/ladder-read.md): **still PASS.**
- The read surface is **read-only** and goes entirely through the server (P6, FR-015); it re-uses
  Feature 7's generated `netVictories` (P8 — no re-derived ranking math).
- The ordering/tiebreak is a **pure, testable** function of stored data (SC-001), and the responsive
  two-layout contract preserves P7 with no horizontal page scroll.
- No new complexity surfaced; the single tracked simplification (live period rollups) is unchanged.

## Phase status

- [x] **Phase 0 — Research** → [research.md](./research.md) (responsive leaderboard + rendering/caching
  + read-placement resolved)
- [x] **Phase 1 — Design & contracts** → [contracts/ladder-read.md](./contracts/ladder-read.md)
  (read surface + view-model + ordering/tiebreak). No `data-model.md` — reuses Feature 7.
- [ ] **Phase 2 — Tasks** → `tasks.md` via `/speckit-tasks` (next)
