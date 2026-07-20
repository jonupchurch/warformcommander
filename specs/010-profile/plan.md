# Implementation Plan: Profile — Career Stats & Achievements

**Branch**: `010-profile` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-profile/spec.md`

## Summary

Build the **commander's career screen** — a read-only view over data that already exists. It
composes a **Profile view-model** from Feature 7's `ladder_standings`, `matches`, and `squads`, and
renders it with Feature 3's shell primitives: identity (handle, avatar, enlistment), career stats
read straight from the ladder (net victories the headline, §13), recent + notable matches each
linked to their replay/summary, most-played squads and most-fielded unit, and a grid of **cosmetic,
derived badges**. Two routes render the same view-model — own profile (`/profile`, session) and any
commander (`/commander/[handle]`) — first-class in both orientations (P7).

The three real decisions, all in [research.md](./research.md): **badges are derived, not stored**
(no `badges` table — a pure function of the ladder counters, keeping cosmetics-not-power structural,
P1); **own vs public differ only in reach + source** (both public; no privacy gating beyond
selecting public columns; editing is out); and **the mockup's MMR/tiers/seasons/units-killed/
per-family-damage have no v1 source** and are deferred rather than faked (v1's ranking is net
victories only). Rendering is **Server-Component-first** — read-only server data, CSS-bar charts, no
client interactivity, no new libraries.

## Technical Context

**Language/Version**: **TypeScript** on **Next.js 16** (App Router, React Server Components), the
existing app at the repo root. Tailwind v4 tokens + shadcn-derived primitives from Feature 3.

**Primary Dependencies**: Feature 3 design system (`src/components/ui`, `shell`, `brand` — `Panel`,
`Stat`, `StatBar`, `Chip`, `UnitIcon`, `IdentityBadge`, `SectionLabel`); Feature 7 persistence
service (`getStanding`, `listMatches`, + additive public read projections). **No new runtime
dependency** — charts are CSS/flex bars (the mockup itself uses plain divs), navigation is
`next/link`.

**Storage**: **None added.** Reads only, through Feature 7's Neon Postgres + Drizzle service layer
(P6 — never client-side DB). The view-model is a transient server-assembled projection; **no new
table** (badges derived — [research R1](./research.md)).

**Testing**: **Vitest/Jest** unit tests for the pure derivations (`profile-stats.ts`,
`badges.ts` — SC-001, SC-004, SC-005) and **Playwright** e2e for the rendered screen (own vs
public, both orientations, cold-start/bot/deleted-opponent, match→replay links — SC-002, SC-003,
SC-006). Matches the repo's stated test stack (STATUS: unit + Playwright; constitution VIII).

**Target Platform**: The web app — **mobile portrait AND desktop landscape, both first-class** (P7).
Server-rendered; runs on Vercel like the rest of the app.

**Project Type**: A **screen feature** inside the existing Next.js app — routes under `app/(app)/`,
components under `src/components/profile/`, server assembly under `src/server/`, pure helpers under
`src/lib/`. No new project, no restructuring.

**Performance Goals**: A profile is a handful of indexed reads (one standing row, a capped
`matches` slice, a small aggregate) + pure mapping — comfortably within a normal server-render
budget. No heavy compute; the replay/blob is never touched (scalar columns only, Feature 7).

**Constraints**: **Display-only** — no stat write (writes are Feature 7/8), no client-trusted
authorization (P6). **Public-columns-only** reads (no `email`/`role` leak — SC-007). **Badges
cosmetic** — no power/unlock/store (P1, SC-004/005). **No horizontal overflow at 360px** (SC-003).

**Scale/Scope**: This feature = the two profile routes, the server assembly, the pure derivations
(stats + badges), and ~7 profile components composing Feature 3. It is **not** the ladder ranking
(Feature 9), the write path (Feature 7/8), or the achievement/unlock system (backlogged).

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1 design. Constitution v3.0.0 — Product
Invariants P1–P8 + Engineering Process I–IX.*

### Product & Architecture Invariants

| Invariant | Status | How this plan satisfies it |
|---|---|---|
| **P1 Non-P2W (NON-NEG)** | ✅ | Badges/achievements are **cosmetic and derived** — a pure function of read-only ladder counters, with **no store to grant into** and no power/unlock output (FR-017..019, SC-004/005). Ladder rewards stay cosmetic by construction. This screen sells nothing and unlocks nothing. |
| **P2 Planning over twitch** | ✅ (N/A) | A read-only career view; no battle input. It *surfaces* the outcomes of pre-battle planning (record, signature squads) rather than adding any twitch surface. |
| **P3 Depth from configuration** | ✅ (enabling) | Signature squads + most-fielded unit read the configuration axes (types/variants/loadouts) back to the player as scouting insight — reinforcing that identity lives in the build, not a roster count. |
| **P4 Fairness is verified** | ✅ (N/A) | No balance surface here; it displays results the verified sim produced. |
| **P5 Content from players/puzzles** | ✅ | **Bot/cold-start profiles are first-class viewable** (FR-004) — the seeded defenders that keep the ladder non-empty have real, linkable profiles, so player-as-content extends to the profile layer. |
| **P6 Deterministic, server-authoritative (NON-NEG)** | ✅ | **Display-only, server-read.** No stat write, no client-trusted authz; all reads go through Feature 7's server service (FR-021). The client cannot fabricate a career number — it only renders the server's projection. |
| **P7 Both platforms first-class** | ✅ | The two-column landscape body collapses to one column in portrait; stat/badge grids reduce columns; no overflow at 360px (FR-020, SC-003) — a Playwright check on both viewports. |
| **P8 Data-driven content** | ✅ | The badge **catalog is typed data**; `UnitIcon`/`MachineTypeKey` and the standing/match shapes are the **shared** Feature 1/3/7 types, reused not redefined (data-model). One source of truth. |

### Engineering Process (I–IX)

| Principle | Status | Note |
|---|---|---|
| **I Clarify** | ✅ | Acceptance scenarios + explicit non-goals; the three genuine unknowns resolved in research (badges/own-vs-public/forward-looking readouts). Zero open `NEEDS CLARIFICATION`. |
| **II Validated trust boundaries** | ✅ | Public-columns-only reads (no `email`/`role`); unknown handle → `notFound()`; all reads server-side; no client-trusted authz (FR-003/005/021, SC-007). |
| **III Match conventions** | ✅ | Composes Feature 3 primitives + tokens (no raw hex); Server-Component-first per `stacks/nextjs.md`; reads through Feature 7's service — no new library, no new pattern. |
| **IV Scope discipline (NON-NEG)** | ✅ | Ranking (F9), write path (F7/8), achievement/unlock system, commanders, Garage, and handle/avatar editing all explicitly **out**; forward-looking mockup readouts deferred, not built. |
| **V Verify before done** | ✅ | Executable checks map to SC-001..007 (pure-derivation unit tests + Playwright both-orientation/own-vs-public); `next build` + typecheck gate. |
| **VI Narrate** | ✅ | research.md records each decision with rationale + the deferred alternatives. |
| **VII Plan whole set first** | ✅ | Planned in dependency order behind Features 3/5/6/7/9 (foundation-first, STATUS). |
| **VIII Test at right level** | ✅ | Unit where the signal is (stat equality, badge derivation — pure functions); Playwright for the rendered paths a unit test can't reach (orientation, links, cold-start). |
| **IX Commit atomically, branch per feature** | ✅ | On `010-profile`; planning artifacts commit atomically; implementation follows. |

**Gate result: PASS.** No deviations — this feature adds no schema, no library, and no new pattern.
P1 and P6 (never-waived) are satisfied structurally, not traded.

## Project Structure

### Documentation (this feature)

```text
specs/010-profile/
├── plan.md              # this file
├── spec.md             # the feature spec
├── research.md          # Phase 0 — badges/own-vs-public/forward-looking/rendering
├── data-model.md        # Phase 1 — the Profile view-model + badge derivation (no new tables)
├── contracts/
│   └── profile-view.md  # Phase 1 — assembly reads, badge/stat pure APIs, components, routes
└── tasks.md             # Phase 2 — created by /speckit-tasks (next step)
```

### Source Code (repository root)

The existing Next.js app lives at the **repo root**. Feature 3 already stubbed
`app/(app)/profile/page.tsx` (a placeholder owned by this feature) and provides the primitives; this
feature fills that route, adds the public `commander/[handle]` route, and adds the assembly + pure
helpers + components. **No restructuring.**

```text
d:/Codelib/warformcommander/
├── app/(app)/
│   ├── profile/
│   │   └── page.tsx                     # EDIT — own profile (session) → getOwnProfile(ctx)  (F3 stubbed)
│   └── commander/                        # NEW
│       └── [handle]/
│           ├── page.tsx                  # NEW — public profile → getProfileByHandle(ctx, handle) + generateMetadata
│           └── not-found.tsx             # NEW — unknown handle (FR-005)
├── src/
│   ├── server/
│   │   └── profile.ts                    # NEW — getOwnProfile / getProfileByHandle; import "server-only"
│   │                                     #        composes Feature 7 reads → ProfileViewModel
│   ├── lib/
│   │   ├── profile-stats.ts              # NEW — pure: toCareerStats / toWeekBuckets / toMatchRow
│   │   └── badges.ts                     # NEW — pure: BADGE_CATALOG + deriveBadges(career)
│   └── components/profile/               # NEW — Server Components, compose Feature 3 primitives
│       ├── profile-hero.tsx              #        IdentityBadge + headline stats + bot/forward-looking markers
│       ├── career-stats-grid.tsx         #        Stat tiles from ladder_standings (FR-006)
│       ├── activity-chart.tsx            #        CSS W/L bars from WeekBucket[] (FR-013)
│       ├── recent-matches.tsx            #        MatchRow list → Summary/Playback links (FR-010)
│       ├── signature-squads.tsx          #        most-played (StatBar) (FR-014)
│       ├── most-fielded-unit.tsx         #        UnitIcon + label (FR-016)
│       └── badge-grid.tsx                #        derived badges (FR-017/018)
├── e2e/
│   └── profile.spec.ts                   # NEW — Playwright: own/public, both orientations, cold-start/bot/deleted, links
└── (Feature 7 service + Feature 3 components/tokens consumed by reference)
```

**Structure Decision**: A **screen feature inside the existing app** — the two `app/(app)/` routes
fill Feature 3's stubbed `profile` route and add `commander/[handle]`; `src/server/profile.ts` is the
single read-assembly point (server-only), `src/lib/{profile-stats,badges}.ts` hold the **pure,
unit-tested** derivations, and `src/components/profile/*` are Server Components composing Feature 3.
Additive public read projections (handle→user, signature-squads aggregate, ladder position) should
extend **Feature 7's service** (it owns DB access) or, if not yet present, live read-only in
`src/server/profile.ts` — **either way no new table** (contracts §2).

## Complexity Tracking

*No constitution deviations to track.* This feature introduces **no new table, no new library, and
no new architectural pattern** — it composes existing Feature 3 primitives and Feature 7 reads. The
only judgment calls (badges derived vs stored; forward-looking readouts deferred; own-vs-public as
one view-model) are **simplifications** recorded in [research.md](./research.md) and the spec's
Assumptions, each reducing scope rather than adding it. P1 and P6 are satisfied structurally.

## Post-Design Constitution Re-check

After Phase 1 (data-model, contract): **still PASS.**
- The view-model reads **only public columns** and has **no write path** → P6 + SC-007 hold.
- `deriveBadges` is a **pure function with no store** → P1 (cosmetic-not-power) is structural, not a
  promise; SC-004/005 are directly testable.
- No new table, library, or pattern surfaced during design → Complexity Tracking stays empty.
- Reusing Feature 1/3/7 types (standing/match/`MachineTypeKey`) keeps **one source of truth** (P8).

## Phase status

- [x] **Phase 0 — Research** → [research.md](./research.md) (badges / own-vs-public / forward-looking / rendering resolved)
- [x] **Phase 1 — Design & contracts** → [data-model.md](./data-model.md), [contracts/profile-view.md](./contracts/profile-view.md)
- [ ] **Phase 2 — Tasks** → `tasks.md` via `/speckit-tasks` (next)
