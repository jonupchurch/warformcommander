# Feature Specification: Ladder (net-victory leaderboard)

**Feature Branch**: `009-ladder`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Ladder — the public async-PvP ranking. Reads Feature 7's
`ladder_standings` and renders a leaderboard ordered by **net victories** (attack wins −
defense losses, design §13), each commander's standing (record, streak, total damage), the
viewer's own rank, and per-period (weekly/monthly) views rolled up from `matches`. Explains the
net-victory model — why a weak defense bleeds rank. Seasons/tiers/MMR appear in the mockup but
are **forward-looking**; v1 ships the net-victory ladder and the schema seam for seasons.
Responsive, both orientations first-class (P7)."

## Overview

This feature is the **Ladder screen** — Warform Commander's public async-PvP ranking. It is a
**read-only view** over the persistence substrate Feature 7 already built: it reads
[`ladder_standings`](../007-accounts-persistence/data-model.md) ordered by **net victories**
and per-period rollups from [`matches`](../007-accounts-persistence/data-model.md), and renders
them as a leaderboard through the Feature 3 shell and design system.

**The stake it makes legible.** Design §13 fixes v1's ranking model:
`netVictories = attackWins − defenseLosses` — **attack wins add, defense losses subtract**. You
climb by winning attacks *and* by fielding a defense snapshot that survives its blind Bo3
battles; a weak defense **bleeds** rank. This is the whole competitive stake in v1 (no MMR/ELO,
no economy rewards — [design §13](../../reference/warformcommandergamedesigndoc.md)), and the
Ladder's job is to display that ranking exactly and explain *why* a defense loss costs you.

**What is forward-looking.** The
[Ladder mockup](../../reference/Warform%20Commander%20Ladder.dc.html) shows an "ASYNC PVP ·
SEASON 1" banner, an **MMR** column, **tier** labels (GOLD III, DIAMOND, MASTER…), and a per-row
**TREND** arrow. Per §13 these are **deferred / presentational** — v1 has no MMR/ELO, no tier
bands, and no rank-history to derive a trend from. This feature ships the **net-victory ladder**
and names the seasons/tiers/MMR/trend layer as future work, keeping only the schema seam
Feature 7 already noted (seasons could extend the `ladder_standings` PK with a `seasonId`). The
mockup's real, wired-to-data metrics — **net victories, total damage, defenses held** — all map
directly to `ladder_standings` columns and are what v1 renders.

The value it delivers: **a commander opens the Ladder, sees who is winning the async-PvP war
ordered by net victories, finds their own rank, understands why their defense record matters,
and can drill into any commander's standing** — first-class on a phone in portrait and a wide
monitor in landscape (constitution [P7](../../.specify/memory/constitution.md)).

## User Scenarios & Testing *(mandatory)*

The "user" is a **commander** viewing the public ranking. Stories are prioritized so US1 alone
is a shippable ladder.

### User Story 1 - View the net-victory leaderboard and find my rank (Priority: P1)

A commander opens the Ladder and sees every commander ranked by **net victories** (attack wins −
defense losses), highest first, with a clear tiebreak so the order is exact and stable. Each row
shows the rank number, the commander's handle, and their net-victory total. The top of the board
highlights the leaders (a podium), and the viewer can **locate their own standing** immediately —
their row is highlighted, and a pinned "your standing" card shows their rank even when they fall
below the current page.

**Why this priority**: This is the entire product of the feature — the public ranking, ordered by
the design's v1 stake (§13). Without it there is no ladder. It is the MVP: even alone it is a
complete, demonstrable leaderboard a player can read and find themselves on.

**Independent Test**: Seed `ladder_standings` with a known set of standings; render the Ladder;
assert the rendered row order is exactly `netVictories DESC` with the defined tiebreak, that a
negative net-victory total sorts below non-negative ones, and that the signed-in viewer's own
rank is visible without scrolling (pinned card) and their row is highlighted.

**Acceptance Scenarios**:

1. **Given** `ladder_standings` rows with varied net-victory totals, **When** the Ladder renders,
   **Then** the rows appear ordered by `netVictories DESC`, and each row shows its rank, the
   commander handle, and the net-victory value.
2. **Given** two standings with equal net victories, **When** the Ladder renders, **Then** they
   are ordered by the defined tiebreak (total damage DESC, then a stable key) and the order is
   identical across reloads.
3. **Given** a commander whose defense losses exceed their attack wins, **When** the Ladder
   renders, **Then** their net-victory total shows as **negative** and their row sits **below**
   every commander with a non-negative total.
4. **Given** the signed-in viewer is ranked below the first page, **When** the Ladder renders,
   **Then** a pinned "your standing" card shows the viewer's rank and net victories without the
   viewer scrolling, and a "jump to my rank" affordance scrolls the list to the viewer's row.
5. **Given** the top three commanders, **When** the Ladder renders, **Then** they appear in the
   podium (rank 1 emphasized), consistent with the ordered list below.
6. **Given** a commander handle in any row, **When** the viewer selects it, **Then** it links to
   that commander's Profile ([Feature 10](../010-profile/), by reference).

---

### User Story 2 - Read a commander's standing: record, streak, total damage (Priority: P2)

Beyond the rank number, each standing exposes the commander's **record** — attack wins/losses and
defense wins (holds)/losses — their **current and best streak**, their **total damage**, and
matches played. This is what turns a bare rank into a legible reputation: a commander with a high
net-victory total *and* a strong defense record reads differently from one riding a hot attack
streak on a leaky defense.

**Why this priority**: The record/streak/damage are the fields that explain a rank and set up the
net-victory model (US4) — a defense loss visibly reduces the net-victory total. P2 because US1's
ordered board must exist first for these details to hang off.

**Independent Test**: Seed a standing with known counters (attack W/L, defense W/L, streaks,
total damage); render its row/detail; assert every field displays the stored value, and that
recording a defense loss (a change to the seeded data) reduces the displayed net-victory total and
lowers the row's rank position.

**Acceptance Scenarios**:

1. **Given** a standing with `attackWins/attackLosses/defenseWins/defenseLosses`, current/best
   streak, and total damage, **When** its row (or detail) renders, **Then** each of those values
   is displayed, sourced from `ladder_standings`.
2. **Given** two commanders identical except one has more defense losses, **When** the Ladder
   renders, **Then** the one with more defense losses shows a **lower** net-victory total and a
   **lower** rank — the design's "weak defense bleeds rank" made visible.
3. **Given** a standing, **When** the metric selector is set to **Total Damage** or **Defenses
   Held**, **Then** the board re-orders by that real `ladder_standings` metric (`totalDamage` /
   `defenseWins`) while the primary stake remains net victories.

---

### User Story 3 - Per-period views: this week / this month (Priority: P2)

A commander can switch the board between an **all-time / season** view (read from
`ladder_standings`) and **per-period** views — **this week** and **this month** — computed as
rollups from the `matches` table over a time window. The period views answer "who is winning
*right now*," independent of lifetime totals, so a returning player or a hot streak is visible
without lifetime history drowning it out.

**Why this priority**: The mockup's range tabs (THIS WEEK / THIS MONTH) are a core affordance, and
per-period rollups are exactly what `matches` exists to support (Feature 7: "per-week rollups from
`matches`"). P2 because it layers on US1's board and metric model.

**Independent Test**: Seed `matches` across two weeks; render the **this-week** view; assert the
per-commander net victories/damage/defenses reflect only ranked matches whose `createdAt` falls in
the window, and match an independent recompute aggregated from `matches`.

**Acceptance Scenarios**:

1. **Given** ranked matches spread across time, **When** the range is set to **This Week**, **Then**
   the board reflects only matches within the current week window (net victories = in-window attack
   wins − in-window defense losses), and excludes older matches.
2. **Given** the range set to **This Month**, **When** it renders, **Then** the window widens to the
   month and the totals grow accordingly.
3. **Given** `practice`-mode matches in the window, **When** a period view renders, **Then** they
   are **excluded** (only `ranked` matches count toward the ladder — Feature 7 FR-019).
4. **Given** the range set to **Season / All-Time**, **When** it renders, **Then** the board reads
   `ladder_standings` (the lifetime cache), not a `matches` rollup.

---

### User Story 4 - Understand the net-victory model (Priority: P3)

The Ladder **explains its own ranking**: an inline, always-available explainer states the model —
**net victories = attack wins − defense losses**; attack wins raise your rank, defense losses lower
it; a weak defense bleeds rank even while you win attacks. This is the design's central stake (§13,
[P4](../../.specify/memory/constitution.md)), and a leaderboard that shows a number without
teaching the rule leaves players confused about why they dropped.

**Why this priority**: It is the conceptual payload of the whole ranking model, but it is an
explainer surface that hangs off the board — P3 because US1–US3 must render the thing being
explained first.

**Independent Test**: Render the Ladder; assert the net-victory explainer is present and legible in
both orientations, states the `attackWins − defenseLosses` formula, and calls out that defense
losses subtract; assert it is reachable without obscuring the board.

**Acceptance Scenarios**:

1. **Given** the Ladder screen, **When** it renders, **Then** an explainer states
   "net victories = attack wins − defense losses" and that a lost defense **subtracts** from rank.
2. **Given** a commander with a negative net-victory total, **When** they view the explainer, **Then**
   the cause (defense losses outweighing attack wins) is made legible next to their own standing.
3. **Given** either orientation, **When** the explainer renders, **Then** it is present and readable
   and does not push the board into horizontal overflow.

---

### Edge Cases

- **Negative net victories** (heavy defense losses): rendered with the sign, sorted *below* all
  non-negative totals; the row is not clamped to zero and not hidden — it is the design's stake made
  visible (US1-AS3, SC-005).
- **Ties in net victories**: resolved by the defined tiebreak (total damage DESC → stable key), so
  the order is exact and identical across reloads and across pages (SC-001, SC-005).
- **Brand-new player, 0 ranked matches**: no `ladder_standings` row exists yet (Feature 7 upserts on
  first ranked result) — the viewer is shown as **unranked** with a call-to-action to the Arena,
  never as a spurious last-place rank (SC-006).
- **Cold-start seeded bots** (`users.isBot = true`, [P5](../../.specify/memory/constitution.md)):
  included by default so the ladder is **never empty** at launch; the query is `isBot`-aware so a
  humans-only view is a single-flag change (SC-008).
- **Very long list**: paginated server-side (keyset over the sort key; offset acceptable at v1
  scale); the viewer's own rank stays locatable via the pinned card + jump-to-me regardless of page.
- **Empty period window** (a week with no ranked matches): the period view renders an empty-state,
  not an error; the season view still shows lifetime standings.
- **Both orientations**: a dense table is a genuine responsive case — **landscape** renders a table,
  **portrait** renders a stacked card list; neither causes horizontal *page* scroll at 360px (a wide
  table scrolls within its own container) (SC-003, P7).
- **A deleted commander** referenced by history: Feature 7 nulls participant FKs on delete; a period
  rollup attributes such rows to no current user and omits them from the ranked list (they never
  appear as a live standing).

## Requirements *(mandatory)*

### Functional Requirements

**Leaderboard (US1 — the net-victory ranking, §13)**

- **FR-001**: The system MUST provide a **Ladder screen** at `/ladder` (inside the authenticated app
  shell) that reads `ladder_standings` through Feature 7's server persistence surface and renders a
  leaderboard **ordered by `netVictories DESC`** (`netVictories = attackWins − defenseLosses`, §13).
- **FR-002**: Each leaderboard row MUST show the commander's **rank**, **handle** (linking to their
  Profile, [Feature 10](../010-profile/)), and **net-victory** total; the top three MUST also render
  in a **podium** consistent with the ordered list.
- **FR-003**: The ordering MUST apply a **defined, deterministic tiebreak** for equal net victories
  (total damage DESC, then a stable key — see Assumptions), so the rendered order is exact and
  identical across reloads and pages; a **negative** net-victory total MUST render with its sign and
  sort **below** all non-negative totals.
- **FR-004**: The screen MUST make the **viewer's own standing locatable** — the viewer's row is
  highlighted, and a **pinned "your standing" card** shows the viewer's rank + net victories even
  when the viewer falls below the current page, with a "jump to my rank" affordance.
- **FR-005**: The leaderboard MUST support a **metric selector** grounded in real `ladder_standings`
  columns — **Net Victories** (primary), **Total Damage** (`totalDamage`), **Defenses Held**
  (`defenseWins`) — re-ordering the board by the selected metric while net victories remains the
  design's primary stake.

**Standing detail (US2)**

- **FR-006**: Each standing MUST expose the commander's **record** (`attackWins`/`attackLosses`,
  `defenseWins`/`defenseLosses`), **current & best streak**, **total damage**, and **matches
  played** — the fields on `ladder_standings` — without re-deriving them from replays.
- **FR-007**: The screen MUST present the **net-victory relationship legibly**: a commander with more
  defense losses shows a lower net-victory total and a lower rank than an otherwise-identical
  commander ("a weak defense bleeds rank", §13).

**Per-period views (US3)**

- **FR-008**: The system MUST support **range views** — **Season / All-Time** (read from
  `ladder_standings`) and **This Week** / **This Month** (computed as rollups from `matches` over the
  respective time windows) — switchable from the screen.
- **FR-009**: Per-period rollups MUST count **`ranked` matches only** (excluding `practice`, per
  Feature 7 FR-019) within the window, computing per-commander net victories (in-window attack wins −
  in-window defense losses), total damage, and defenses held from the `matches` scalar columns.

**Net-victory explainer (US4)**

- **FR-010**: The screen MUST include an **inline explainer** of the ranking model — that
  `netVictories = attackWins − defenseLosses` and that **defense losses subtract** — legible in both
  orientations and not obscuring the board.

**Cold-start & new players (P5)**

- **FR-011**: Seeded **bot** standings (`users.isBot = true`) MUST be **included by default** so the
  ladder is never empty (P5, [design §16.1](../../reference/warformcommandergamedesigndoc.md)); the
  read query MUST be `isBot`-aware so a humans-only view is a single-flag change.
- **FR-012**: A commander with **no `ladder_standings` row** (no ranked matches yet) MUST be shown as
  **unranked** with a call-to-action, never assigned a spurious rank.

**Responsive, rendering & trust boundary (P7, P6)**

- **FR-013**: The Ladder MUST be **responsive and first-class in both orientations** (P7): a **table**
  in landscape and a **stacked card list** in portrait, with **no horizontal page scroll** from 320px
  through ultra-wide; any wide element (the table) scrolls within its own container, never the page.
- **FR-014**: The Ladder MUST render **server-side** (Server Component) via the Feature 7 persistence
  surface, with the **shared leaderboard** cached under a short revalidation window (it updates as
  ranked matches record) while the **per-viewer** standing/highlight remains dynamic (never
  cross-user cached); long lists MUST paginate.
- **FR-015**: The Ladder MUST be **read-only**: it MUST NOT write standings or matches and MUST access
  data only through the **server** persistence surface (no client-side DB access) — standings are
  server-authoritative (Feature 7/8, P6).

**Scope boundary (Principle IV)**

- **FR-016**: This feature MUST NOT: compute or maintain standings / matches (Feature 7/8 own the
  write path — this reads); perform matchmaking or run battles ([Feature 8](../008-arena/)); render the
  Profile screen ([Feature 10](../010-profile/) — link only); or build **seasons / tiers / MMR / trend**
  (deferred — the mockup's SEASON banner, MMR column, tier labels, and trend arrows are presentational
  chrome in v1, not wired to data; the season **schema seam** noted by Feature 7 is named, not built).

### Key Entities *(include if feature involves data)*

This feature introduces **no new persisted entities** — it reads Feature 7's schema. It defines only
a **display view-model** derived from those tables.

- **`ladder_standings`** *(read; owned by [Feature 7](../007-accounts-persistence/data-model.md))* —
  per-user net-victory cache: `attackWins/attackLosses/defenseWins/defenseLosses`, generated
  `netVictories = attackWins − defenseLosses`, `matchesPlayed`, `totalDamage`, `currentStreak`,
  `bestStreak`; indexed on `netVictories` for `ORDER BY … DESC`. The Season/All-Time board reads this.
- **`matches`** *(read; owned by Feature 7)* — resolved-Bo3 summaries with scalar per-side damage,
  winner side, `mode`, participant IDs, and `createdAt`. The per-period rollups aggregate this.
- **`users`** *(read; owned by Feature 7)* — supplies the commander `handle` and the `isBot` flag.
- **LadderRow** *(display view-model, this feature)* — a presentational row: `rank`, `handle`,
  `userId` (→ Profile link), `netVictories`, the record/streak/damage summary, `isViewer`, `isBot`,
  and the currently-selected metric value. Derived from the reads above; carries no authority.
- **ViewerStanding** *(display view-model, this feature)* — the signed-in viewer's own standing +
  computed rank, for the pinned card (or an "unranked" marker when no standing row exists).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Order fidelity** — for any seeded `ladder_standings`, the rendered leaderboard order
  **exactly matches** `netVictories DESC` with the defined tiebreak (total damage DESC → stable key);
  a test comparing the rendered order to an independently-sorted query reports zero discrepancy.
- **SC-002**: **A defense loss lowers rank** — recording a defense loss for a commander (a change to
  the seeded standing) **visibly reduces** their displayed net-victory total and moves their row to a
  lower rank position, verified by a before/after test.
- **SC-003**: **Both orientations first-class (P7)** — the Ladder renders with **zero horizontal page
  scroll** and the leaderboard legible at **360×640 (portrait, card list)** and **1440×900 (landscape,
  table)**, plus 320px min and an ultra-wide width — verified by automated viewport tests.
- **SC-004**: **Own rank locatable** — the signed-in viewer's rank is visible in **≤1 interaction**
  (pinned card always on screen; "jump to my rank" scrolls to the highlighted own-row) in both
  orientations, including when the viewer is off the first page.
- **SC-005**: **Negatives & ties** — negative net-victory totals render with their sign and sort below
  all non-negative totals; tied net victories resolve by the defined tiebreak into a **stable** order
  identical across reloads — verified by test.
- **SC-006**: **New player** — a commander with 0 ranked matches (no standing row) is shown as
  **unranked** with a CTA, never as a spurious rank — verified by test.
- **SC-007**: **Per-period correctness** — the This-Week view reflects only `ranked` matches within
  the window and equals an independent recompute aggregated from `matches`; `practice` matches are
  excluded — verified by test.
- **SC-008**: **Never empty (P5)** — with only seeded `isBot` standings present, the leaderboard
  renders a populated board; toggling the `isBot` filter yields a humans-only view with no other
  change — verified by test.

## Assumptions

- **Net victories is v1's only ranking stake (§13).** The board ranks by
  `netVictories = attackWins − defenseLosses` read from `ladder_standings`. **MMR/ELO, tiers, and a
  per-row trend are DEFERRED** — the mockup's MMR column, tier labels (GOLD III…), "SEASON 1" banner,
  and TREND arrows are **presentational/forward-looking** and are **not wired to data** in v1 (MMR
  and tiers have no source; trend would need rank-history snapshots that are not stored). v1 may show
  a single static "ASYNC PVP" label as non-functional chrome. *(Judgment call — recorded per
  Principle VI; the design explicitly defers these in §13/§16.)*
- **Tiebreak rule (judgment call).** For equal net victories the order is
  **`netVictories DESC → totalDamage DESC → userId ASC`**. Rationale: total damage rewards the more
  active/impactful commander among equals; `userId` is a final **stable, deterministic** key so the
  order is exact and reproducible (required by SC-001/SC-005) and safe for keyset pagination. This is
  a Feature-9 decision, not fixed by the design doc; it can be re-tuned centrally.
- **Season is a label, not a partition, in v1.** All-Time == "Season 1" because no season boundary is
  stored. Feature 7 noted `ladder_standings`' PK **could** extend with a `seasonId`; that seam is
  **named, not built** here (Principle IV).
- **Per-period rollups are computed live from `matches`** (a windowed `GROUP BY` per request), not a
  materialized per-period standings table — appropriate at v1 scale and it avoids adding a write path
  Feature 7/8 would own (see plan Complexity Tracking). Windows are calendar-based (week/month) in the
  app's configured timezone.
- **Cold-start bots are shown by default** so the ladder is never empty (P5); a humans-only view is a
  one-flag change (`isBot` filter). *(Judgment call: alternative — hide bots — was rejected for v1
  because it yields a near-empty ladder at launch, contradicting P5's "never empty".)*
- **Reads through Feature 7's service.** The Ladder consumes the existing
  [`getLeaderboard` / `getStanding`](../007-accounts-persistence/contracts/persistence-api.md) reads,
  extended (additively, read-only) with the metric/tiebreak/`isBot` options and joined by a
  Feature-9-owned **viewer-rank** and **per-period rollup** read. No write path is added.
- **Depends on Feature 3** (app shell, tokens, primitives) for chrome, and on **Feature 7** (schema +
  persistence service) for data; both are prerequisites. **Feature 10 (Profile)** is linked from rows
  but is a separate feature; **Feature 8 (Arena)** owns matchmaking and the write path.
- **Stack**: Next.js 16 App Router + TypeScript, Tailwind v4, Server Components by default
  ([`stacks/nextjs.md`](../../stacks/nextjs.md)); unit/integration via the repo's test runner (Vitest,
  per Feature 7) and e2e via Playwright.
