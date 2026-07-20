# Data Model: Profile — Career Stats & Achievements

**Feature**: `010-profile` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

This feature **adds no persistent tables**. It defines a **view-model** — a public, render-ready
shape assembled server-side from the Feature 7 tables — and a **badge derivation** over the ladder
counters. The persistent schema is entirely Feature 7's; this doc references it and never
re-declares it (constitution **P8** — one source of truth).

**Source tables (Feature 7 — [007 data-model](../007-accounts-persistence/data-model.md)):**
`users` (public columns only: `handle`, `image`, `createdAt`, `isBot`), `ladder_standings`,
`matches`, `squads`. Reads flow through the Feature 7 service layer
([persistence-api](../007-accounts-persistence/contracts/persistence-api.md)) plus the small
additive projections named in [contracts/profile-view.md](./contracts/profile-view.md) — never
client-side DB access (P6).

---

## The Profile view-model

Assembled by `getOwnProfile(ctx)` / `getProfileByHandle(viewerCtx, handle)` in `src/server/profile.ts`.
TypeScript-shaped (illustrative, not the implementation).

```ts
interface ProfileViewModel {
  identity:       ProfileIdentity;
  ladderRank:     number | null;      // display-only #N from standings order (FR-008); null if unranked
  career:         CareerStats;        // == ladder_standings, + recomputed record/win-rate
  activity:       WeekBucket[];       // recent weeks W/L, derived from matches (FR-013)
  recentMatches:  MatchRow[];         // newest-first, capped (FR-009)
  notable:        MatchRow[];         // 0..N highlighted results (best win / top damage) — optional (FR-013)
  signatureSquads:SignatureSquad[];   // most-played, from matches × squads (FR-014)
  mostFieldedUnit:MostFieldedUnit | null;  // from squad configs (FR-016); null ⇒ omit
  badges:         BadgeView[];        // derived, cosmetic (FR-017..019)
}

interface ProfileIdentity {
  handle:     string;                 // users.handle
  avatarUrl:  string | null;          // users.image; null ⇒ brand-mark fallback (FR-001)
  enlistedAt: Date;                   // users.createdAt — "ENLISTED" (FR-001)
  isBot:      boolean;                // users.isBot — render a seeded/AI marker (FR-004, P5)
  isOwn:      boolean;                // viewer === subject (affects reach/label only, not data)
}
```

### CareerStats — the projection of `ladder_standings` (FR-006)

Every raw field is copied straight from the standing; **`record` and `winRatePct` are recomputed**,
never stored (SC-001).

```ts
interface CareerStats {
  // raw — equals ladder_standings 1:1
  attackWins: number; attackLosses: number;
  defenseWins: number;                // "DEFENSES HELD"
  defenseLosses: number;
  netVictories: number;               // = attackWins − defenseLosses (§13) — headline (FR-007)
  matchesPlayed: number;
  totalDamage: number;
  currentStreak: number; bestStreak: number;
  // recomputed for display (not persisted)
  wins: number;                       // attackWins + defenseWins
  losses: number;                     // attackLosses + defenseLosses
  record: `${number}–${number}`;      // `${wins}–${losses}` (mockup "87–55")
  winRatePct: number;                 // round(wins / max(matchesPlayed,1) * 100)
}
```

| Display tile (mockup) | Value | Note |
|---|---|---|
| WIN RATE | `winRatePct` | recomputed |
| MATCHES | `matchesPlayed` | raw |
| RECORD | `record` | recomputed `wins–losses` |
| NET VICTORIES (headline) | `netVictories` | §13 stake |
| DEFENSES HELD | `defenseWins` | raw |
| BEST / CURRENT STREAK | `bestStreak` / `currentStreak` | raw |
| TOTAL DAMAGE | `totalDamage` | raw (compact-formatted) |
| ~~UNITS KILLED / AVG MATCH / Damage Profile~~ | — | **deferred**, no v1 source ([research R3](./research.md)) |

### MatchRow — a display projection of a `matches` row (FR-009..012)

```ts
interface MatchRow {
  matchId:     string;
  result:      "W" | "L";             // from winnerSide relative to the subject's side
  side:        "attack" | "defense";  // subject was attacker or defender
  score:       `${number} – ${number}`;   // subject games – opponent games (Bo3)
  opponent:    OpponentRef;           // handle | hidden (practice) | deleted (null FK)
  isPractice:  boolean;               // mode==='practice' ⇒ opponent hidden, excluded from counters (FR-011)
  summaryHref: string;                // → Feature 6 by matchId (FR-010)
  playbackHref:string;                // → Feature 5 by matchId (FR-010)
  playedAt:    Date;
}

type OpponentRef =
  | { kind: "commander"; handle: string; profileHref: string }  // → /commander/[handle]
  | { kind: "hidden" }                                          // practice (FR-011)
  | { kind: "deleted" };                                        // null participant FK (FR-012)
```

> The mockup's per-row `+24 / −18` **MMR delta** has no v1 source ([research R3](./research.md)); a
> row shows result + Bo3 score (and, if wanted, its ±1 net-victory contribution), not an MMR figure.

### WeekBucket / SignatureSquad / MostFieldedUnit

```ts
interface WeekBucket { label: string; wins: number; losses: number; }  // e.g. "W1" (FR-013)

interface SignatureSquad {              // from matches grouped by attackerSquadId × squads (FR-014)
  name: string;                         // squads.name; "[deleted squad]" placeholder if FK null (FR-015)
  games: number;
  winRatePct: number;                   // wins / games within this squad
}

interface MostFieldedUnit {             // from the subject's squad configs (FR-016)
  type: MachineTypeKey;                 // Feature 3 UnitIcon key ("heavytank" | … | "support")
  label: string;                        // "Heavy Tank"
  pickPct?: number;                     // simplified pick share across the subject's squads (optional)
}
```

`MachineTypeKey` is the shared enum from [Feature 3 `UnitIcon`](../003-app-shell/contracts/components.md)
(and Feature 1's seven machine types) — reused, not redefined.

---

## Badge derivation (cosmetic, no store — FR-017..019, [research R1](./research.md))

A **typed catalog** of static definitions, evaluated against `CareerStats` by a pure
`deriveBadges(career): BadgeView[]`. **No table, no per-user row, no write** (SC-004, SC-005).

```ts
interface BadgeDefinition {
  id:    string;                        // stable key, e.g. "centurion"
  name:  string;                        // "Centurion"
  desc:  string;                        // "Reach 100 ranked victories."
  icon:  BadgeIcon;                     // a UnitIcon type OR a generic star mark (cosmetic only)
  goal:  number;                        // threshold (e.g. 100)
  measure: (c: CareerStats) => number;  // pure read of a counter (e.g. c => c.wins)
}

interface BadgeView {
  id: string; name: string; desc: string; icon: BadgeIcon;
  state: "earned" | "in-progress";      // earned ⟺ measure(c) ≥ goal
  progress: number;                     // min(measure/goal, 1) — drives the bar (FR-018)
  progressText: string;                 // e.g. "87 / 100"
}
```

**Invariants (the P1 guardrails):**
- `measure` reads **only** `CareerStats` counters — never a store, never another feature's state.
- `deriveBadges` is **total and pure**: same `CareerStats` ⇒ same `BadgeView[]`, no I/O, no write.
- A `BadgeView` carries **only display fields** — no capability, unlock, stat, or gameplay value can
  be attached (SC-004). Crossing a threshold flips exactly one badge's `state` and changes nothing
  else (spec US4-AS2).

**v1 catalog** (all measures exist on `ladder_standings`): First Deployment (`matchesPlayed ≥ 1`),
Centurion (`wins ≥ 100`), Ace Defender (`defenseWins ≥ 100`), Hot Streak (`bestStreak ≥ 10`),
Net Positive / Ascendant (`netVictories ≥ 1 / 100`), Heavy Ordnance (`totalDamage ≥ 1M / 10M`),
Veteran (`matchesPlayed ≥ 100 / 500`). **Deferred** (no v1 source — omitted, not faked): zero-loss,
units-killed, per-family-damage, aircraft-composition, and opponent-rank/gear badges
([research R1](./research.md)).

---

## Assembly & trust boundary

`src/server/profile.ts` (`import "server-only"`) assembles a view-model as:

1. Resolve subject — session `userId` (own) or `handle → user` (public); **404 unknown handle** (FR-005).
   Select **only public columns** (`handle`, `image`, `createdAt`, `isBot`) — never `email`/`role` (FR-003, SC-007).
2. `career` ← `getStanding(user.id)` (Feature 7), then recompute `record` / `winRatePct` / `wins` / `losses`.
3. `recentMatches` / `activity` / `notable` ← `listMatches({ userId, limit })` (Feature 7), mapped to
   `MatchRow` with Summary/Playback hrefs; practice opponents hidden, null participants → `deleted` (FR-011/012).
4. `signatureSquads` ← a matches×squads aggregate projection (public provenance, **not** the private roster).
5. `mostFieldedUnit` ← the subject's squad configs (machine-type frequency).
6. `ladderRank` ← optional standings-position read (display-only; Feature 9 owns real ranking).
7. `badges` ← `deriveBadges(career)` — pure.

All reads are server-side and read-only; the profile has **no write path** (FR-021, P6). The only
values that cross to the client are the public `ProfileViewModel` fields.

## Entity relationship summary

```
users(public cols) 1──1 ladder_standings      → CareerStats (equals it) + deriveBadges()
users              1──* matches (attacker/defender) → MatchRow[], WeekBucket[], SignatureSquad[]
matches            *──1 squads (attackerSquadId, set null) → SignatureSquad.name
users              1──* squads (configs)       → MostFieldedUnit
# No new tables. ProfileViewModel is a transient server-assembled projection.
```
