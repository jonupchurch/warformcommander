# Contract: Ladder Read Surface + Display View-Model

**Feature**: `009-ladder` | **Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

The **read-only** query surface the Ladder screen calls and the **display view-model** it renders.
This feature adds **no persisted entities** and **no write path** — it reads
[Feature 7's schema](../007-accounts-persistence/data-model.md) and composes the existing
[persistence-service reads](../007-accounts-persistence/contracts/persistence-api.md). Every read
runs Feature 7's trust-boundary checks (authenticated session; server-side only; no client DB
access). Signatures are TypeScript-shaped contracts (illustrative, not the implementation);
`Result<T>` = success `T` or a typed `{ error, reason }`, as in Feature 7.

---

## 1. Query surface (`src/server/ladder/queries.ts` — read-only)

```ts
type LadderMetric = "net" | "damage" | "defenses";     // net victories | total damage | defenses held
type LadderRange  = "season" | "week" | "month";        // season == all-time (lifetime cache) in v1
type LadderCursor = { netVictories: number; totalDamage: number; userId: string } | null;

interface LadderQueryOpts {
  metric?: LadderMetric;        // default "net"
  range?: LadderRange;          // default "season"
  limit?: number;               // page size (clamped, e.g. ≤ 100)
  cursor?: LadderCursor;        // keyset page cursor (or offset — see note); null = first page
  includeBots?: boolean;        // default TRUE (P5, never-empty); false ⇒ humans-only (FR-011)
}

// The main board read. For range="season" reads ladder_standings; for week/month rolls up matches.
getLadderPage(ctx, opts: LadderQueryOpts): Result<{
  rows: LadderRowData[];        // ordered by the metric with the DEFINED TIEBREAK (see §3)
  nextCursor: LadderCursor;     // null when the last page is reached
  totalRanked: number;          // count of ranked commanders in this range (for "N commanders")
}>

// The signed-in viewer's own standing + computed rank (for the pinned card). Range-aware.
getViewerStanding(ctx, opts: { range?: LadderRange; metric?: LadderMetric; includeBots?: boolean }):
  Result<ViewerStanding>        // { ...LadderRowData } | { state: "unranked" } (FR-012, SC-006)

// The top-3 for the podium (a convenience read; == the first 3 rows of getLadderPage).
getPodium(ctx, opts: { metric?: LadderMetric; range?: LadderRange; includeBots?: boolean }):
  Result<LadderRowData[]>       // length 0..3
```

`LadderRowData` is the **raw** per-commander shape the queries return (scalar columns only — no
replay parse):

```ts
interface LadderRowData {
  userId: string;
  handle: string | null;        // users.handle (null ⇒ render a placeholder, links to Profile by id)
  isBot: boolean;               // users.isBot (P5 marker)
  rank: number;                 // 1-based, per the ordered result + tiebreak
  netVictories: number;         // attackWins − defenseLosses  (may be NEGATIVE — FR-003)
  attackWins: number;  attackLosses: number;
  defenseWins: number; defenseLosses: number;   // defenseWins = holds
  currentStreak: number; bestStreak: number;
  totalDamage: number;
  matchesPlayed: number;
  metricValue: number;          // the value for the CURRENTLY SELECTED metric (net/damage/defenses)
}
```

- **`range="season"`** ⇒ read `ladder_standings` ordered by §3; `rank` from the ordered position.
- **`range="week"|"month"`** ⇒ `GROUP BY` over `matches` where `mode='ranked'` and `createdAt` in the
  window; per-commander `netVictories` = in-window attack wins − in-window defense losses, `totalDamage`
  = summed per-side damage, `defenseWins` = in-window holds. `currentStreak`/`bestStreak`/`matchesPlayed`
  are lifetime-only concepts — in period views they are omitted or shown as in-window counts (documented
  in the view-model). (research C1/C2.)
- **`includeBots=false`** joins `users` and filters `isBot = false` (FR-011, SC-008).

### Relationship to Feature 7's reads

| Feature 7 (persistence-api.md) | Feature 9 use |
|---|---|
| `getLeaderboard(ctx, { limit, offset })` | The season/all-time board; **extended additively** (read-only) with `metric`/`tiebreak`/`includeBots`/keyset `cursor`, or wrapped by `getLadderPage`. |
| `getStanding(ctx, userId)` | Backs `getViewerStanding` (adds the computed `rank`). |
| `recomputeStanding(userId)` | Feature 7's reconciliation oracle — reused by the SC-002 test, not by the screen. |

Feature 7/8 remain the **sole writers** of `ladder_standings`/`matches`; this surface never mutates.

---

## 2. Display view-model (`src/components/ladder/view-model.ts`)

Pure mapping from `LadderRowData` (+ session) to what a row/card renders. No data access.

```ts
interface LadderRow {
  rank: number;
  handle: string;               // handle or a fallback label
  profileHref: string;          // → Feature 10 Profile route (by userId)
  netVictories: number;
  netVictoriesLabel: string;    // signed, e.g. "+18" / "−7"  (negative rendered with sign — FR-003)
  record: string;               // e.g. "22–9 · 14–3D"  (attack W–L · defense W–L holds/losses)
  streak: { current: number; best: number };
  totalDamage: number;
  metric: LadderMetric;
  metricValueLabel: string;     // formatted value of the selected metric (damage → grouped digits)
  isViewer: boolean;            // → own-row highlight (cyan edge + tint, per mockup)
  isBot: boolean;               // optional subtle marker; not power-bearing
}

interface ViewerStandingVM =
  | { state: "ranked"; row: LadderRow }
  | { state: "unranked"; ctaHref: string };   // "no ranked matches yet — enter the Arena" (FR-012)

// The two pure builders under test (SC-001 mapping, SC-005 negatives):
toLadderRows(data: LadderRowData[], viewerUserId: string | null, metric: LadderMetric): LadderRow[];
toViewerStanding(v: ViewerStanding, metric: LadderMetric): ViewerStandingVM;
```

---

## 3. Ordering & tiebreak (the load-bearing guarantee — SC-001, SC-005)

The board is ordered by the **selected metric DESC**, then a **deterministic tiebreak**:

- **metric = net** (primary/default): `net_victories DESC, total_damage DESC, user_id ASC`.
- **metric = damage**: `total_damage DESC, net_victories DESC, user_id ASC`.
- **metric = defenses**: `defense_wins DESC, net_victories DESC, user_id ASC`.

`user_id ASC` is the final **stable** key so the order is exact, reproducible across reloads, and
safe for keyset pagination (spec Assumptions). Negative `net_victories` sort **below** non-negatives
naturally under `DESC` (FR-003). `rank` is the 1-based position in this total order.

> The season board's primary order is served by Feature 7's `standings_net_idx` on `net_victories`;
> for efficient keyset paging a composite index `(net_victories DESC, total_damage DESC, user_id)`
> is the recommended refinement (a read-only index add — noted in tasks, not a schema/write change).

---

## Contract guarantees

1. **Read-only** — no function here writes; standings/matches are authored solely by Feature 7/8 (P6,
   FR-015).
2. **Order is a pure function of stored data** — given the same `ladder_standings`, `getLadderPage`
   yields the same order with the defined tiebreak (SC-001); testable against an independent sort.
3. **Trust boundary** — every read goes through the server surface with an authenticated session
   (Feature 7 A1); `searchParams`-derived opts are validated/clamped before use (Principle II).
4. **Never empty** — `includeBots` defaults true so seeded bots populate the board (P5, SC-008).
5. **Unranked is explicit** — a viewer with no standing row returns `{ state: "unranked" }`, never a
   fabricated rank (FR-012, SC-006).
6. **Scalar-only** — all reads use `ladder_standings`/`matches` scalar columns; no replay jsonb is
   parsed for the ladder.
