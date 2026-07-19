---
description: "Task list for Feature 10 — Profile (career stats & achievements)"
---

# Tasks: Profile — Career Stats & Achievements

**Input**: Design documents from `specs/010-profile/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/profile-view.md](./contracts/profile-view.md)

**Tests**: **INCLUDED and non-optional.** The feature's core guarantees are executable — displayed
career stats **equal** `ladder_standings` (SC-001), badges are **derived and cosmetic** (SC-004/005),
and the screen renders in **both orientations** with working replay/summary links (SC-002/003).
Constitution Principle VIII + P1/P6/P7 require them. Pure-derivation tests are written **before** the
functions they pin.

**Depends on**: **Feature 3** (shell primitives + tokens + the stubbed `app/(app)/profile` route),
**Feature 7** (persistence service: `getStanding`, `listMatches`, + the additive public projections
in [contracts §2](./contracts/profile-view.md)). Links out to **Feature 5** (Playback) and **Feature
6** (Summary) by `matchId`, and **Feature 9** (Ladder) links in. Where a Feature 7 additive read is
not yet present, implement it read-only in `src/server/profile.ts` (public columns only) — **no new
table** (T007).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 (maps to spec.md); Setup/Foundational/Polish carry no story label
- TS paths are under the repo root; components under `src/components/profile/`, pure helpers under `src/lib/`, assembly under `src/server/`, routes under `app/(app)/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the upstream surfaces this feature composes and scaffold the module skeleton.

- [ ] T001 Confirm Feature 3 primitives (`Panel`, `Stat`, `StatBar`, `Chip`, `UnitIcon`, `IdentityBadge`, `SectionLabel`) and tokens are importable, and that `app/(app)/profile/page.tsx` exists as a Feature-3 stub to be filled ([Feature 3 components](../003-app-shell/contracts/components.md), [tasks T026](../003-app-shell/tasks.md)).
- [ ] T002 Confirm the Feature 7 read surface (`getStanding`, `listMatches`) and enumerate the additive public projections needed ([contracts §2](./contracts/profile-view.md)): `getUserByHandle`, `getSignatureSquads`, `getMostFieldedUnit`, `getLadderPosition`. Note which exist vs. must be added read-only in `src/server/profile.ts`.
- [ ] T003 [P] Scaffold empty modules per [plan Project Structure](./plan.md): `src/server/profile.ts` (`import "server-only"`), `src/lib/profile-stats.ts`, `src/lib/badges.ts`, and the seven `src/components/profile/*.tsx` files with typed signatures from [contracts §3–5](./contracts/profile-view.md). Compile-only stubs.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `ProfileViewModel` types and the read-assembly skeleton every story renders from.
Nothing in Phase 3+ can begin until this is done.

**⚠️ CRITICAL**: This is the shared view-model + the server-only assembly entry points.

- [ ] T004 Define the `ProfileViewModel` and its member types (`ProfileIdentity`, `CareerStats`, `MatchRow`, `OpponentRef`, `WeekBucket`, `SignatureSquad`, `MostFieldedUnit`, `BadgeDefinition`, `BadgeView`) in `src/lib/profile-types.ts` exactly per [data-model.md](./data-model.md); reuse Feature 1/3/7 types (`MachineTypeKey`, `LadderStanding`, `MatchSummary`) by import — **do not redefine** (P8).
- [ ] T005 Implement the assembly entry points in `src/server/profile.ts`: `getOwnProfile(ctx)` and `getProfileByHandle(ctx, handle)` — resolve subject (session `userId` / `handle → user`), **select public columns only** (`handle`,`image`,`createdAt`,`isBot`; never `email`/`role`), return `NOT_FOUND` for an unknown handle. Returns a `ProfileViewModel` (sections filled by later stories). Trust boundary per [data-model §Assembly](./data-model.md) (FR-002/003/005, **SC-007**).
- [ ] T006 Wire the two routes to the assembly: fill `app/(app)/profile/page.tsx` (own → `getOwnProfile`) and create `app/(app)/commander/[handle]/page.tsx` (await `params.handle` → `getProfileByHandle`; call `notFound()` on `NOT_FOUND`) + `not-found.tsx`, both Server Components; add `generateMetadata` (handle in tab title) on the public route (FR-002/005, `stacks/nextjs.md`).
- [ ] T007 Provide the additive public read projections identified in T002 — extend Feature 7's service if available, else implement read-only in `src/server/profile.ts` against `getDb()`: `getUserByHandle` (public cols), `getSignatureSquads` (matches×squads aggregate), `getMostFieldedUnit` (squad-config frequency), `getLadderPosition` (standings order). **No schema change, no new table** ([contracts §2](./contracts/profile-view.md)).

**Checkpoint**: a profile resolves for own + by-handle and renders an (empty) shell; stories can begin.

---

## Phase 3: User Story 1 — Career stats + identity (P1) 🎯 MVP

**Goal**: an identity block + a career-stats grid that **equals `ladder_standings`**, on both own
and public routes, in both orientations — the truthful career summary that is the MVP.

**Independent Test**: seed a user with a known standing; render `/profile` and `/commander/[handle]`;
assert every displayed figure equals the standing (record/win-rate recomputed), identity shows
handle/avatar/enlistment, no private field appears, and net victories is the headline.

### Tests for User Story 1 ⚠️ (write first)

- [ ] T008 [P] [US1] `src/lib/profile-stats.test.ts`: `toCareerStats(standing)` — every raw counter equals the standing; `record` = `wins–losses`, `winRatePct` = round(wins/matchesPlayed·100), `netVictories` passes through; a zero standing yields a coherent all-zero `CareerStats` (**SC-001**, spec US1-AS1).
- [ ] T009 [P] [US1] `e2e/profile.spec.ts`: render own + public profiles for a seeded standing; assert the displayed career tiles equal the standing and that **no `email`/`role`** appears in the response/DOM (**SC-007**, US1-AS3); assert net victories is the headline and no live MMR/tier/season number is shown (US1-AS4).

### Implementation for User Story 1

- [ ] T010 [US1] Implement `toCareerStats` in `src/lib/profile-stats.ts` (pure: copy counters, recompute `wins`/`losses`/`record`/`winRatePct`) per [contracts §4](./contracts/profile-view.md).
- [ ] T011 [US1] Assemble `identity` + `career` (+ optional `ladderRank` via `getLadderPosition`) in `src/server/profile.ts` from `getStanding` + the public user read (FR-006/007/008).
- [ ] T012 [P] [US1] Implement `src/components/profile/profile-hero.tsx` — `IdentityBadge` (handle, avatar w/ brand-mark fallback, "ENLISTED" `createdAt`) + headline stats (win rate, matches, best streak, **net victories**); render a **seeded/AI marker** when `isBot` (FR-001/004/007); render MMR/tier/rank-progress **omitted or labelled forward-looking** (FR-008, [research R3](./research.md)).
- [ ] T013 [P] [US1] Implement `src/components/profile/career-stats-grid.tsx` — `Stat` tiles for record, defenses held, total damage (compact-formatted), streaks, matches (FR-006); responsive grid (4→2 cols) with no 360px overflow (FR-020).

**Checkpoint**: identity + career stats render truthfully on both routes and both orientations — MVP.

---

## Phase 4: User Story 2 — Recent & notable matches + activity (P2)

**Goal**: a newest-first recent-matches list (result / Bo3 score / side / opponent) with **each
ranked row linking to its Summary and Playback**, an activity strip, and optional notable results —
handling practice (opponent hidden) and deleted opponents gracefully.

**Independent Test**: seed ranked + practice matches (some as defender, one deleted opponent); assert
rows show correct result/score/side, ranked rows link to the right `matchId`, practice rows hide the
opponent and stay out of the ranked counters, and the deleted-opponent row renders without error.

### Tests for User Story 2 ⚠️ (write first)

- [ ] T014 [P] [US2] `src/lib/profile-stats.test.ts`: `toMatchRow(m, subjectUserId)` — result/side/score computed from the subject's perspective; practice → `opponent: hidden` + `isPractice`; null participant → `opponent: deleted`; Summary/Playback hrefs address the `matchId` (spec US2-AS1/2/3/4, **SC-002**).
- [ ] T015 [P] [US2] `src/lib/profile-stats.test.ts`: `toWeekBuckets(matches, weeks)` buckets W/L by week; empty input → empty strip (US2-AS5).
- [ ] T016 [P] [US2] `e2e/profile.spec.ts`: a ranked match row navigates to its Battle Summary ([Feature 6](../006-battle-summary/)) and offers Playback ([Feature 5](../005-battle-playback/)); a deleted-opponent row renders as deactivated; a practice row hides the opponent (**SC-002**, US2-AS2/3/4).

### Implementation for User Story 2

- [ ] T017 [US2] Implement `toMatchRow` + `toWeekBuckets` in `src/lib/profile-stats.ts` (pure), including the Feature 6/5 URL shapes by `matchId` (FR-009/010/011/012/013).
- [ ] T018 [US2] Assemble `recentMatches`, `activity`, and optional `notable` in `src/server/profile.ts` from `listMatches({ userId, limit })` (cap the list; exclude practice from the FR-006 counters) (FR-009/011/013).
- [ ] T019 [P] [US2] Implement `src/components/profile/recent-matches.tsx` — rows with result chip, Bo3 score, side, opponent (`commander` link / `hidden` / `deleted`), each ranked row linking Summary + Playback (FR-009/010/012); long/large values format compactly (edge cases).
- [ ] T020 [P] [US2] Implement `src/components/profile/activity-chart.tsx` — CSS/flex W/L bars from `WeekBucket[]` (no chart lib, [research R4](./research.md)); empty-state strip; responsive (FR-013/020).

**Checkpoint**: recent matches + activity render; every ranked row reaches its replay/summary.

---

## Phase 5: User Story 3 — Signature squads & most-fielded unit (P3)

**Goal**: most-played squads (name / games / win-rate bar) and the most-fielded unit (`UnitIcon`),
derived from public match provenance + squad configs, degrading gracefully on deleted squads / no
squads.

**Independent Test**: seed matches across a few squads (one since-deleted); assert squads rank by
games with correct win-rate bars, a deleted squad shows a placeholder, and the most-fielded unit
renders the right `UnitIcon`; a commander with no squads omits the unit section.

### Tests for User Story 3 ⚠️ (write first)

- [ ] T021 [P] [US3] `e2e/profile.spec.ts` (or a unit test on the aggregate mapper): signature squads ordered by games with correct win-rate; null `attackerSquadId` → `[deleted squad]` placeholder (US3-AS1/2, FR-014/015); most-fielded unit renders the correct `UnitIcon` type and is **omitted** when the commander has no squads (US3-AS3, FR-016).

### Implementation for User Story 3

- [ ] T022 [US3] Assemble `signatureSquads` + `mostFieldedUnit` in `src/server/profile.ts` via `getSignatureSquads` / `getMostFieldedUnit` (T007), mapping deleted squads to a placeholder name (FR-014/015/016).
- [ ] T023 [P] [US3] Implement `src/components/profile/signature-squads.tsx` — name + match count + win-rate `StatBar` per squad (FR-014); responsive.
- [ ] T024 [P] [US3] Implement `src/components/profile/most-fielded-unit.tsx` — `UnitIcon` + label (+ simplified pick indicator); return `null` to omit when `mostFieldedUnit` is null (FR-016).

**Checkpoint**: a commander's tendencies (squads + unit) render; deleted/absent cases are graceful.

---

## Phase 6: User Story 4 — Badges & achievements (P3)

**Goal**: a grid of **derived, cosmetic** badges (earned / in-progress) computed from the ladder
counters against a typed catalog — no store, no power, no faked criteria.

**Independent Test**: feed the deriver a fixed standing; assert the earned/in-progress set is exactly
the catalog thresholds, progress fractions are right, a threshold crossing flips exactly one badge
and changes nothing but display, and no badge is read from or written to any store.

### Tests for User Story 4 ⚠️ (write first)

- [ ] T025 [P] [US4] `src/lib/badges.test.ts`: `deriveBadges(career)` — earned ⟺ `measure ≥ goal`; `progress = min(measure/goal,1)`; boundary (99→100) flips exactly one badge; a zero-career shows all catalog badges unearned/0-progress (US4-AS1/2/4, **SC-005**).
- [ ] T026 [P] [US4] `src/lib/badges.test.ts`: **cosmetic invariant** — `deriveBadges` is pure (no import of any store/DB), a `BadgeView` exposes only display fields (no capability/unlock/stat), and the catalog contains **no** criterion needing v1-absent data (per-family damage, units killed, zero-loss, gear) (US4-AS3, **SC-004**, [research R1](./research.md)).

### Implementation for User Story 4

- [ ] T027 [US4] Implement `src/lib/badges.ts` — `BADGE_CATALOG` (First Deployment, Centurion, Ace Defender, Hot Streak, Net Positive/Ascendant, Heavy Ordnance, Veteran — all measures over `CareerStats`) + pure `deriveBadges(career)` per [data-model §Badge derivation](./data-model.md) (FR-017/018/019).
- [ ] T028 [US4] Assemble `badges` in `src/server/profile.ts` via `deriveBadges(career)` (pure; no read/write) (FR-017).
- [ ] T029 [P] [US4] Implement `src/components/profile/badge-grid.tsx` — earned / in-progress (progress bar) tiles composing `Panel`/`UnitIcon`; earned-count header; responsive (4→2→1 cols) (FR-018/020).

**Checkpoint**: badges render as derived cosmetics — flipping a counter flips only the picture.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T030 [P] Compose the full page in both routes (hero + 2-column body → single column in portrait + badges section) matching the [Profile mockup](../../reference/Warform%20Commander%20Profile.dc.html) layout with Feature 3 tokens only (no raw hex).
- [ ] T031 `e2e/profile.spec.ts`: **both orientations** — no horizontal overflow at **360px portrait** and **1440px landscape** (**SC-003, P7**); **cold-start** (zero-match) and **bot/cold-start** (`isBot`) profiles render valid states; **unknown handle** → not-found (**SC-006**, edge cases).
- [ ] T032 [P] Verify `next build` + typecheck/lint clean; confirm both routes are dynamic server reads (no accidental static caching of standings) per [research R4](./research.md) / `stacks/nextjs.md`.
- [ ] T033 [P] Update `STATUS.md` (Feature 10 → built) and `CHANGELOG.md` (profile screen: derived cosmetic badges, no new table); post the devlog news update per project convention.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → confirms Feature 3 + Feature 7 surfaces; no code deps.
- **Foundational (P2)** → depends on Setup; **blocks all user stories** (view-model + assembly + routes).
- **US1 (P3)** → depends on Foundational; the MVP (identity + career stats).
- **US2 (P4)** → depends on Foundational; largely parallel to US1 (matches vs standing; different files).
- **US3 (P5)** → depends on Foundational (+ T007 aggregates); parallel to US1/US2.
- **US4 (P6)** → depends on `CareerStats` from US1's `toCareerStats` (T010); otherwise independent.
- **Polish (P7)** → depends on all desired stories.

### Within a story

Tests (pure-derivation / e2e) first → pure helpers (`profile-stats`/`badges`) → server assembly →
components → route composition. Commit after each task or logical group (Principle IX).

### Parallel opportunities

- Setup: T003 alongside T001/T002.
- Foundational: T004 then T005–T007 (T007 parallel once T004 types exist).
- US1 tests T008/T009 in parallel; components T012/T013 in parallel after T010/T011.
- US2 tests T014–T016 in parallel; components T019/T020 in parallel after T017/T018.
- US3 T023/T024 in parallel; US4 T025/T026 in parallel, then T029.
- US1–US4 can proceed in parallel once Foundational is done (different files, one shared view-model).

---

## Implementation Strategy

### MVP first (US1)

1. Setup → 2. Foundational → 3. **US1** → **STOP & VALIDATE** (career stats equal `ladder_standings`,
SC-001, on both routes + orientations). That alone is a complete, truthful career screen.

### Incremental delivery

US1 (career stats + identity) → US2 (matches + activity, replay/summary links) → US3 (signature
squads + unit) → US4 (derived cosmetic badges). Each adds value without breaking prior stories; the
feature is "done" when SC-001..007 are green (unit + Playwright) and `next build` passes.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- **Read-only, public-columns-only, no writes** — the whole feature is a projection; any temptation
  to write a stat, a badge row, or a rank belongs to Feature 7/8/9, not here (P1/P6, SC-004/005/007).
- Keep the **pure derivations pure** (`profile-stats.ts`, `badges.ts` — no I/O): they are the SC-001
  and SC-004/005 contract and the reason those guarantees are cheaply testable.
- Deferred mockup readouts (MMR/tiers/seasons, per-family damage, units killed, per-match MMR delta)
  stay **omitted or labelled forward-looking** — never fabricated ([research R3](./research.md)).
