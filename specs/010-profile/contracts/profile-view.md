# Contract: Profile View Assembly

**Feature**: `010-profile` | **Spec**: [../spec.md](../spec.md) | **Data model**:
[../data-model.md](../data-model.md)

The server-side read surface that assembles a `ProfileViewModel` from Feature 7 data, and the
component API the profile screen composes from Feature 3 primitives. Feature 10 **owns no
persistence** — it reads through Feature 7's service layer (P6: never client-side DB access). All
signatures are TypeScript-shaped contracts (illustrative), not the implementation.

`Result<T>` = success `T` or a typed `{ error, reason }` (Feature 7 convention). `ctx` = the
resolved server session (`{ userId, role }`) — never a client argument.

---

## 1. Profile assembly — `src/server/profile.ts` (`import "server-only"`)

```ts
// Own profile: the signed-in commander. Reached via the shell IdentityBadge.
getOwnProfile(ctx): Result<ProfileViewModel>

// Any commander by handle. Any signed-in viewer; renders the same public view-model.
getProfileByHandle(ctx, handle: string): Result<ProfileViewModel>
  // errors: NOT_FOUND (unknown handle → the route calls notFound(), FR-005)
```

Both compose the reads in §2 into the [`ProfileViewModel`](../data-model.md) and MUST:

- select **only public `users` columns** (`handle`, `image`, `createdAt`, `isBot`) — never `email` /
  `role` / auth-adapter fields (FR-003, **SC-007**);
- render a **bot** subject (`isBot`) rather than 404 it, with a seeded/AI marker (FR-004, **P5**);
- exclude **practice** matches from the ranked career figures and hide their opponents (FR-011);
- never write — assembly is read-only (FR-021, **P6**).

---

## 2. Reads consumed from Feature 7 (persistence-api)

Feature 10 leans on the existing [persistence-api](../007-accounts-persistence/contracts/persistence-api.md)
and needs a few **additive read-only public projections**. **None require a schema change** — they
are queries over existing Feature 7 tables (spec Assumptions; report note: *no badges table*).

| Read | Status | Source / note |
|---|---|---|
| `getStanding(ctx, userId)` | **exists** (F7 US5) | the whole `CareerStats` source (FR-006) |
| `listMatches(ctx, { userId, mode?, limit })` | **exists** (F7 US4) | recent matches, activity, notable (FR-009/013) |
| `getUserByHandle(handle) → PublicUser` | **additive** | `handle → { id, handle, image, createdAt, isBot }`; **public columns only**. Resolve for `/commander/[handle]` |
| `getSignatureSquads(userId, limit) → SignatureSquad[]` | **additive** | `matches` grouped by `attackerSquadId` × `squads.name`; null FK → placeholder (FR-014/015) |
| `getMostFieldedUnit(userId) → MostFieldedUnit \| null` | **additive** | machine-type frequency over the subject's `squads.config` (FR-016) |
| `getLadderPosition(userId) → number \| null` | **additive, optional** | display-only `#N` from standings order (FR-008); real ranking is [Feature 9](../009-ladder/) |

> The additive reads SHOULD live in **Feature 7's service layer** (it owns DB access), exposed as
> public projections; Feature 10's `src/server/profile.ts` orchestrates them. Where Feature 7 has not
> yet added them, Feature 10 may implement the read-only projection against `getDb()` in its own
> server module — still server-only, still public-columns-only. Either way: **no new table**.

---

## 3. Badge derivation — `src/lib/badges.ts` (pure, no I/O)

```ts
export const BADGE_CATALOG: readonly BadgeDefinition[];        // typed static data (data-model)
export function deriveBadges(career: CareerStats): BadgeView[]; // pure: same input ⇒ same output
```

**Guarantees (P1 / SC-004 / SC-005):**

- `deriveBadges` performs **no read and no write** — it is a pure function of `CareerStats`.
- Every `BadgeDefinition.measure` reads **only** `CareerStats` counters.
- A `BadgeView` exposes **only display fields** (`state`, `progress`, `progressText`, `name`, `desc`,
  `icon`) — never a capability, unlock, stat, or gameplay value.
- **No `badges` / `achievements` table is read or written** — the catalog is code.

---

## 4. Stat derivations — `src/lib/profile-stats.ts` (pure, no I/O)

```ts
export function toCareerStats(standing: LadderStanding): CareerStats;  // copies counters + recomputes record/win-rate
export function toWeekBuckets(matches: MatchSummary[], weeks: number): WeekBucket[];
export function toMatchRow(m: MatchSummary, subjectUserId: string): MatchRow;  // side, result, score, opponent, hrefs
```

`toCareerStats` MUST recompute `record`, `winRatePct`, `wins`, `losses` from the raw counters and
copy every other field verbatim — the equality tested by **SC-001**. Summary/Playback hrefs are the
Feature 6 / Feature 5 URL shapes addressed by `matchId` (FR-010).

---

## 5. Component API — `src/components/profile/*` (Server Components; compose Feature 3)

Every component is token-driven and composes [Feature 3 primitives](../003-app-shell/contracts/components.md)
(`Panel`, `Stat`, `StatBar`, `Chip`, `UnitIcon`, `IdentityBadge`, `SectionLabel`) — **no raw hex, no
new chrome** (Feature 3 SC-002). All are Server Components (no client interactivity in v1).

```ts
ProfileHero({ identity, career, ladderRank }): JSX          // IdentityBadge + headline stats + bot/forward-looking markers
CareerStatsGrid({ career }): JSX                            // Stat tiles from CareerStats (FR-006)
ActivityChart({ weeks }): JSX                               // CSS W/L bars from WeekBucket[] (FR-013); no chart lib
RecentMatches({ rows }): JSX                                // MatchRow list; each ranked row links Summary/Playback (FR-010)
SignatureSquads({ squads }): JSX                            // name + games + win-rate StatBar (FR-014)
MostFieldedUnit({ unit }): JSX | null                       // UnitIcon + label; null ⇒ render nothing (FR-016)
BadgeGrid({ badges }): JSX                                  // earned / in-progress tiles (FR-017/018)
```

**Guarantees:** responsive both-orientation (2-col landscape body → 1-col portrait; grids reduce
columns) with **no horizontal overflow at 360px** (FR-020, **SC-003, P7**); a `hidden`/`deleted`
opponent and a `[deleted squad]` render gracefully (FR-012/015); a bot and a zero-stat commander
render coherent states (**SC-006**).

---

## 6. Routes

| Route | File | Rendering |
|---|---|---|
| `/profile` | `app/(app)/profile/page.tsx` | Server Component → `getOwnProfile(ctx)` (Feature 3 stubbed this route) |
| `/commander/[handle]` | `app/(app)/commander/[handle]/page.tsx` | Server Component → `getProfileByHandle(ctx, await params.handle)`; `generateMetadata` sets the tab title to the handle |
| unknown handle | `app/(app)/commander/[handle]/not-found.tsx` | `notFound()` from the page (FR-005) |

Both routes live in the authenticated `(app)` group (profiles are viewed from inside the app; the
only public no-session surface is Feature 11). `[handle]` params are `await`ed (Next 16 async params,
`stacks/nextjs.md`).

## Non-goals

The stat **write path** (Feature 7/8), the **ladder leaderboard** ranking/seasons/tiers/MMR (Feature
9 — linked), the full **achievement/unlock/progression** system (backlogged, §10), **commanders**
(§15), the **Garage** roster editor (Feature 4), and **handle/avatar editing** (Feature 7
onboarding/settings). This contract assembles and renders a public career view — it does not compute
rank, grant anything, or mutate state.
