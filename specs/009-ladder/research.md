# Research: Ladder

**Feature**: `009-ladder` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

Two genuine unknowns warranted a look; everything else (the ranking math, the storage, the
standings write path) is already settled in
[Feature 7](../007-accounts-persistence/data-model.md) and
[Feature 1](../001-battle-sim-core/data-model.md). Kept deliberately short.

---

## A. Responsive leaderboard — a dense table across both orientations (P7)

**Decision.** Render **two layouts from one data source**, both present in the DOM and toggled by
`lg:` utilities (the exact pattern Feature 3's `PrimaryNav` uses for top-tab vs bottom-tab):

- **Landscape (≥ `lg`)** — a **table**: `RANK · COMMANDER · RECORD · STREAK · NET VICTORIES`
  (+ the selected metric column). The table lives inside an `overflow-x-auto` container so, in the
  worst case, *it* scrolls — never the page (FR-013).
- **Portrait (< `lg`)** — a **stacked card list**: one card per commander with the rank + handle on
  the top line, the **net-victory** value as the prominent figure, and record/streak/damage as
  secondary readouts. A dense 5-column table is unreadable at 360px; a card is the right portrait
  primitive.
- **Podium (top 3)** and the **pinned viewer-standing card** render in both.

**Alternatives considered.**
- *One table that reflows* — rejected: a 5+ column table at 360px either overflows the page
  (breaks SC-003) or shrinks columns to unreadable; the mockup's landscape density doesn't
  translate to a phone by CSS alone. Two purpose-built layouts is the P7 obligation (design *for*
  each orientation, not adapt one).
- *Horizontal-scroll the table on phones* — rejected as the primary portrait experience (poor
  thumb ergonomics); the `overflow-x-auto` wrapper is only the safety net for the landscape table.

**Long lists — pagination & virtualization.**
- **Server-side pagination** is the v1 answer (SSR-friendly, no client list machinery). Because
  `netVictories` is **not unique**, prefer **keyset/cursor pagination** over the full sort key
  `(net_victories, total_damage, user_id)` — stable under a shifting ladder and index-friendly.
  **Offset pagination** (the `getLeaderboard(limit, offset)` Feature 7 already exposes) is
  acceptable at v1 scale; keyset is the correctness upgrade when volume grows.
- **Virtualization** (react-window/virtua) is **not needed** with server pagination and is
  **deferred**; it would only matter if a single very-long page were client-rendered.
- **Infinite scroll** is an optional progressive enhancement over paged links — deferred.

**Own-rank locatability.** The viewer may be off the current page. Solution: a **pinned
"your standing" card** (always on screen) fed by a dedicated **viewer-rank** query
(`COUNT(*) of standings that rank above me, + 1`), plus a **jump-to-my-rank** control that navigates
to the viewer's page/anchor and highlights the own-row (SC-004).

---

## B. Rendering & caching on Next 16 — a live-ish leaderboard

**Decision.** The Ladder page is a **Server Component** that reads through the Feature 7 service.
Split caching by audience:

- **Shared leaderboard body** (the ordered list for a given metric/range/page) is **the same for
  every viewer** → cache it under a **short revalidation window** so it stays live-ish as ranked
  matches record. Use Next 16 **Cache Components** (`use cache` + `cacheLife` of ~30–60s) on the
  leaderboard read, or an equivalent route-segment `revalidate`. Optionally tag it
  (`cacheTag('ladder')`) so the match-record path (Feature 8's `recordMatch`) *could*
  `revalidateTag('ladder')` for near-immediate freshness — named as an **optional** coupling, not a
  dependency (time-based revalidation is sufficient for v1; the ladder is not real-time).
- **Per-viewer overlay** — the viewer's own-row highlight and the pinned "your standing" card depend
  on the session and **must not be cross-user cached**. Render these in a **dynamic** slot (they read
  the session; reaching for `cookies()`/session opts the slot into dynamic rendering, per
  [`stacks/nextjs.md`](../../stacks/nextjs.md)). PPR/streaming: the cached board can prerender while
  the per-viewer card streams in.
- **`loading.tsx`** provides the skeleton while the (possibly dynamic) segments resolve.

**Why not fully dynamic (`force-dynamic`) or fully static.** Fully dynamic re-queries the whole
board on every hit for data that changes on the order of matches-per-minute (wasteful); fully static
goes stale on a live ladder. The **shared-cached + per-viewer-dynamic** split matches how the data
actually changes (stacks/nextjs.md: "caching is explicit; know whether a segment is static or
dynamic").

**Reads are validated at the boundary.** `searchParams` (`metric`, `range`, `page`/cursor) are
**async in Next 16** (`await searchParams`) and are **validated/clamped** to the known enums before
use (Principle II) — an unknown metric falls back to net victories, an out-of-range page clamps.

---

## C. Where the per-period rollup and viewer-rank reads live

**Decision.** Feature 7 already exposes `getLeaderboard` / `getStanding`
([persistence-api.md](../007-accounts-persistence/contracts/persistence-api.md)). Feature 9 needs
three read shapes on top:

1. **Season/All-Time leaderboard** with the **metric + tiebreak + `isBot` filter** options — an
   **additive, read-only extension** of Feature 7's `getLeaderboard` opts (or a thin Feature-9
   wrapper over it). No write path, no schema change.
2. **Per-period rollup** — a **windowed `GROUP BY` over `matches`** (ranked only, `createdAt` in
   window), owned by a Feature-9 read module. Feature 7's `matches` indexes
   (`(mode, createdAt)`, attacker/defender) support it.
3. **Viewer rank** — `COUNT(*)` of standings ranking above the viewer over the composite sort key.

These live in a Feature-9 **read-only** module (`src/server/ladder/queries.ts`) that imports the
shared `getDb()` + Feature 7 schema. Placing them here (vs. growing Feature 7's service) keeps the
ladder-specific aggregation with the ladder while touching **no** write path — Feature 7/8 remain the
sole authors of `ladder_standings`/`matches` (P6). Option to instead fold (1) into Feature 7's
`getLeaderboard` is noted; either is read-only and additive.

**Materialization is deferred.** Computing period rollups live (a `GROUP BY` per request) is fine at
v1 scale and avoids a per-period standings table (which would be a *write path* Feature 7/8 own, plus
drift risk). If volume ever makes the live aggregation slow, a materialized weekly-standings table is
the escalation — tracked in [plan.md](./plan.md) Complexity Tracking, not built now.

---

## Summary of decisions

| # | Decision | Rationale |
|---|---|---|
| A1 | Two layouts (landscape table / portrait cards), toggled by `lg:` | P7 — design *for* each orientation; a dense table can't reflow to 360px (SC-003) |
| A2 | Server pagination; keyset over `(net,damage,userId)` preferred, offset OK at v1 | `netVictories` non-unique; stable order under a shifting ladder; virtualization deferred |
| A3 | Pinned viewer-standing card + jump-to-me, fed by a dedicated rank query | Own rank locatable even off-page (SC-004) |
| B1 | Server Component; shared board **cached** (short revalidate) + per-viewer overlay **dynamic** | Live-ish without re-querying per hit; never cross-user cache a per-viewer highlight |
| B2 | Validate/clamp `searchParams` (metric/range/page) at the boundary | Principle II; unknown → net-victory default |
| C1 | Feature-9 read-only module for period rollup + viewer rank; extend `getLeaderboard` opts additively | Keeps ladder reads with the ladder; touches no write path (P6) |
| C2 | Per-period rollups computed live from `matches`; materialization deferred | v1 scale; avoids a write path/drift; escalation path recorded |
