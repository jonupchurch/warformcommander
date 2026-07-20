# Research: Profile — Career Stats & Achievements

**Feature**: `010-profile` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

Feature 10 is **display over Feature 7 data**, so most decisions are already made upstream (the
schema, the service API, the shell primitives). Only four questions needed resolving; each is short.

---

## R1. Badges/achievements in v1 — derive from stats, or a store?

**Decision**: **Derive.** The badge catalog is **typed static data** (`src/lib/badges.ts`); each
badge's state is computed from `ladder_standings` counters at render time by a pure
`deriveBadges(career)`. **No `badges` / `achievements` table, no per-user badge rows.**

**Why**:
- The **progression / unlock layer is backlogged** (design [§10](../../reference/warformcommandergamedesigndoc.md)):
  in v1 everything is unlocked, so an achievement has **nothing to grant** — it can only *describe*
  what a commander has done. That is exactly a derivation of existing counters.
- Constitution **P1** (non-P2W): ladder rewards and badges are **cosmetic, never power**. A derived,
  read-only badge cannot become a reward vector — there is no store to write a "grant" to. This makes
  P1 **structural**, not a promise.
- Feature 7 mentioned "a badges source" **without defining a table** — this resolves it: the source
  is a *derivation*, so **no schema change to Feature 7 is needed**.

**What ships (derivable from `ladder_standings` alone)** — the v1 catalog, e.g.:

| Badge | Rule over the standing | State |
|---|---|---|
| First Deployment | `matchesPlayed ≥ 1` | earned once played |
| Centurion | total ranked victories `≥ 100` | in-progress bar below 100 |
| Ace Defender | `defenseWins ≥ 100` (defenses held) | in-progress bar |
| Hot Streak | `bestStreak ≥ 10` | earned |
| Net Positive / Ascendant | `netVictories ≥ {1, 100}` | tiered |
| Heavy Ordnance | `totalDamage ≥ {1M, 10M}` | tiered |
| Centenarian Veteran | `matchesPlayed ≥ {100, 500}` | tiered |

**Deferred (need data v1 does not store) — not faked**: "Untouchable" (zero units lost — no per-match
survivor scalar on `matches`), "Wall Breaker / 500 units killed" (no units-killed store), "Siege
Master / 1M artillery damage" (no per-family damage — only `totalDamage`), "Sky Marshal / win 50 with
2 aircraft" (needs per-match config inspection), "Counter-Meta / beat a top-100 on base gear" (needs
opponent rank + gear at match time). These return when the richer aggregates (or the achievement
system) ship. The mockup's locked "Counter-Meta" tile is precisely this deferred tier.

**Report line**: **no badges table is needed** — v1 derives from `ladder_standings`.

---

## R2. Own-profile vs public-profile — routing, privacy, editing

**Decision**: **Two routes, one view-model.** Own profile at `app/(app)/profile/page.tsx` (session
user — the route [Feature 3 already stubbed](../003-app-shell/tasks.md)); any commander at
`app/(app)/commander/[handle]/page.tsx`. Both build the **same** public `ProfileViewModel`; the only
difference is resolution — session `userId` vs `handle → user` lookup — and that own-profile is the
identity-badge destination.

**Privacy**: everything a profile shows is **public ladder data** (net victories, record, recent
matches, most-played). So there is **no privacy gating** — the guard is simply that the server read
selects only the **public columns** (`handle`, `image`, `createdAt`, `isBot`) and the standing/match
projections, never `email` / `role` / auth-adapter rows (spec FR-003, SC-007).

**Editing**: **out of scope.** Handle is assigned on onboarding and the avatar comes from Google
(Feature 7). A profile-edit/settings surface is a separate concern; Feature 10 is display-only. This
keeps the feature a clean read.

**Placement**: profiles sit **inside the authenticated `(app)` group** — the only public no-session
surface in v1 is the marketing/News site (Feature 11). Any signed-in viewer can open any commander.

---

## R3. Which mockup elements have a v1 data source?

The [Profile mockup](../../reference/Warform%20Commander%20Profile.dc.html) is aspirational; several
readouts pre-date the "net victories only" v1 decision. Mapping each to a source:

| Mockup element | v1 source | Verdict |
|---|---|---|
| Handle / avatar / "ENLISTED" | `users.handle` / `image` / `createdAt` | **ship** |
| Win rate, matches, best streak (hero) | `ladder_standings` (recomputed win-rate) | **ship** |
| Career stats grid (record, defenses held, total damage, streak) | `ladder_standings` | **ship** |
| Activity · last 8 weeks (W/L bars) | `matches` weekly rollup (derived) | **ship** |
| Recent matches (result, score, opponent) | `matches` + Summary/Playback links | **ship** |
| Most-played squads (name, WR, games) | `matches` × `squads` aggregate | **ship** |
| Most-fielded unit + `UnitIcon` | squad-config derivation | **ship** (pick-rate simplified) |
| Badges & achievements | derived (R1) | **ship** (v1 subset) |
| `GOLD III` / `1510 MMR` / rank-progress / "peak GOLD II" / seasons | — none (no MMR/tiers/seasons in v1, §13) | **defer / mark forward-looking** |
| Damage Profile (kinetic/energy/explosive %) | — none (only `totalDamage` scalar) | **defer** |
| "UNITS KILLED", "AVG MATCH", per-match "+24" MMR delta, unit "71% pick rate" | — none stored | **defer / simplify** |

**Decision**: render the "ship" rows faithfully; **omit or clearly mark** the MMR/tier/season and
per-family/units-killed rows as forward-looking rather than fabricate numbers. A display-only ladder
position `#N` (from standings order) is an acceptable stand-in for the rank readout.

---

## R4. Rendering strategy on Next 16

**Decision**: **Server-Component-first, dynamic read.** The profile is read-only server data with
essentially no client interactivity — the charts are pure CSS bars, navigation is `next/link`. So:

- `app/(app)/profile/page.tsx` and `app/(app)/commander/[handle]/page.tsx` are **Server Components**
  that call the server-side assembly (`src/server/profile.ts`, `import "server-only"`), which composes
  Feature 7 reads. No `"use client"` is required for v1.
- `[handle]` **params are `await`ed** (async request APIs, `stacks/nextjs.md`); an unknown handle
  calls `notFound()` → `not-found.tsx` (FR-005).
- **Dynamic**, not statically cached: standings/matches change with play and the segment reads
  session/handle. (A later refinement could add `use cache` + a tag invalidated by `recordMatch`, but
  v1 keeps it simple — no premature caching, per `stacks/nextjs.md`.)
- `generateMetadata` on the public route sets the tab title to the commander's handle.

No new libraries: charts are CSS/flex over the Feature 3 tokens (matching the mockup's inline-bar
approach); no chart dependency is introduced (Principle III — the mockup itself uses plain divs).
