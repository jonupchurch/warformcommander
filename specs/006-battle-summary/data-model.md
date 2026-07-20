# Data Model: Battle Summary

**Feature**: `006-battle-summary` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

This feature persists **nothing** and defines **no new stored entity**. Its "data model" is a single
**display-only ViewModel** derived, purely and totally, from data that already exists: Feature 1's resolved
**`MatchResult`** (+ the replay `meta.unitOrder` and tick rate) and Feature 7's **ladder-standing delta**.
The result types are **reused, not duplicated** — this document references them and maps them onto the
display. The machine-readable TS shape lives in [contracts/view-model.md](./contracts/view-model.md).

## Reused inputs (owned elsewhere — do not redefine)

| Input | Owner | Shape (reference) |
|---|---|---|
| **`MatchResult`** | Feature 1 | `{ winner: Side, games: GameResult[], perMachineFates, perSideDamageTotals, survivorCounts }` — [../001-battle-sim-core/data-model.md](../001-battle-sim-core/data-model.md) Tier 3 |
| **`GameResult`** | Feature 1 | `{ winner: Side \| null, condition: Conquest \| Time, rewardTier: Full \| Lesser, durationTicks: u16 }` |
| **`BattleResult`** (per game) | Feature 1 | `{ winCondition, perMachineFates: DestroyedAtTick(t) \| SurvivedWithHullPct(p), perSideDamageTotals, survivorCounts, durationTicks }` |
| **Replay `meta`** | Feature 1 | `unitOrder: { side, instanceId, typeId, variantId }[]` (machine identity) + `tickRate` (durations) — [../001-battle-sim-core/contracts/replay-format.md](../001-battle-sim-core/contracts/replay-format.md) |
| **Replay `games[].events`** | Feature 1 | per-tick event arrays (`dmg` by actor/target) — read **once** only for the optional MVP (research [D3](./research.md)) |
| **Standing delta** | Feature 7 | net-victory change `{ delta, before, after }` + `mode: ranked \| practice` — [../007-accounts-persistence/spec.md](../007-accounts-persistence/spec.md) US5/FR-021 |
| **Design tokens / primitives** | Feature 3 | Panel/StatBar/Stat/Chip/Button/SectionLabel/UnitIcon + faction/zone tints — [../003-app-shell/contracts/components.md](../003-app-shell/contracts/components.md) |

**Viewer context.** The derivation takes a **`viewerSide: Side`** so every "you vs them" value is computed
from the viewer's perspective (FR-003; supports viewer = side A *or* B). It also takes the **opponent**
identity (name/handle, or an anonymized marker for a practice match, §16.1) and the **replay reference**
(`matchId`) for the Watch-Replay hand-off.

## The derived entity — `BattleSummaryViewModel` (display-only)

A presentation-ready structure; the components render it directly and hold **no logic**. Its fields and
their provenance:

### `outcome` — the hero verdict (US1)

| Field | Type | Derived from |
|---|---|---|
| `verdict` | `"VICTORY" \| "DEFEAT"` | `MatchResult.winner === viewerSide` |
| `bestOf` | `number` (3) | match config (Bo3) |
| `seriesLabel` | `string` (e.g. `"2 – 1"`) | count of `games` won by viewer vs opponent |
| `gamesWon` / `gamesLost` | `number` | tally over `games[].winner` vs `viewerSide` |
| `opponent` | `{ name?, href?, hidden: boolean }` | Feature 7 (name/link for ranked; `hidden` for practice §16.1) |

### `series` — per-game pips (US1)

`pips: { game: 1..3, result: "W" \| "L" }[]` — one per game **actually played** (length = `games.length`;
a 2-0 yields two, a 2-1 yields three). `result` from `games[i].winner === viewerSide`.

### `perGame[]` — the game breakdown cards (US1 + US2)

One entry per `GameResult`:

| Field | Type | Derived from |
|---|---|---|
| `game` | `number` (1-based) | index |
| `result` | `"W" \| "L"` | `winner === viewerSide` |
| `condition` | `"CONQUEST" \| "TIME"` | `GameResult.condition` |
| `conditionDetail` | `string?` (e.g. `"DMG"`, `"exact tie → defender"`) | Time games; the exact-tie affordance when damage was equal |
| `rewardTier` | `"FULL" \| "LESSER"` | `GameResult.rewardTier` (Conquest→Full, Time→Lesser, §9.3) |
| `survivors` | `{ viewer: number, opponent: number }` | per-game `survivorCounts`, mapped to viewer side |
| `durationSeconds` | `string` (e.g. `"8.2s"`) | `durationTicks / tickRate` (10 t/s, §9) |

### `totals` — the match comparison bars (US2)

Per-side, viewer vs opponent, each with the value **and** the max for bar scaling:

| Metric | Type | Derived from | Guarantee |
|---|---|---|---|
| `damageDealt` | `{ viewer, opponent }` | `MatchResult.perSideDamageTotals` | **equals** the result totals (SC-003) |
| `unitsKilled` | `{ viewer, opponent }` | `5 − enemySurvivors` (fixed 5-unit army, FR-008) | matches survivor counts |
| `unitsLost` | `{ viewer, opponent }` | `5 − ownSurvivors` | matches survivor counts |
| `avgHullLeft` | `{ viewer, opponent }` (%) | mean of surviving machines' `SurvivedWithHullPct` per side | 0% on a total wipe |

### `perMachine[]` — the fate rows (US2)

One entry per machine in `meta.unitOrder` (up to 10):

| Field | Type | Derived from |
|---|---|---|
| `side` | `"viewer" \| "opponent"` | `unitOrder[i].side` vs `viewerSide` |
| `typeKey` | `MachineTypeKey` | `unitOrder[i].typeId` → Feature 3 `UnitIcon` key |
| `variant` | `string` | `unitOrder[i].variantId` |
| `fate` | `{ kind: "destroyed", atTick, atSeconds } \| { kind: "survived", hullPct }` | `MatchResult` per-machine fate (`DestroyedAtTick(t) \| SurvivedWithHullPct(p)`) |

### `mvp?` — optional standout (US2, enhancement)

`{ typeKey, variant, side, damageDealt, kills, damageAbsorbed }` — present **only** when per-machine damage
is available (extended result field, or the single event reduction of research [D3](./research.md));
**omitted** otherwise (FR-010). Selection = max damage dealt (tie-break: kills, then absorbed) among the
viewer's machines.

### `standing?` — the ranking change (US4)

| Field | Type | Derived from |
|---|---|---|
| `mode` | `"ranked" \| "practice"` | Feature 7 |
| `delta` | `number?` | Feature 7 net-victory update (ranked only) |
| `before` / `after` | `number?` | Feature 7 standing before/after |
| `label` | `string` (e.g. `"+1 NET VICTORY"`, `"UNRANKED"`) | formatted from the above |

For a **practice** match: `mode = "practice"`, no `delta/before/after`, `label = "UNRANKED"` (FR-011).

### `actions` — the exits (US3)

`{ watchReplayHref, findNextOpponentHref, backHref }` — `watchReplayHref` → Battle Playback (Feature 5) for
this `matchId`; `findNextOpponentHref` → Arena (Feature 8); `backHref` → Arena/Garage.

## Derivation contract (the invariants a test pins)

`deriveSummaryViewModel(result, ctx)` is **pure and total**:

1. **Full-field representation (SC-001).** Every `MatchResult` field — `winner`; each `GameResult`'s
   `winner`/`condition`/`rewardTier`/`durationTicks`; per-machine fates; `perSideDamageTotals`;
   `survivorCounts` — maps to a ViewModel field above. Nothing is dropped.
2. **Totals equality (SC-003).** `totals.damageDealt` equals `perSideDamageTotals`; `unitsKilled/Lost` and
   `avgHullLeft` are exact functions of `survivorCounts` + per-machine fates.
3. **Perspective correctness (FR-003).** All viewer/opponent splits derive from `ctx.viewerSide`; swapping
   it swaps every "you vs them" value and flips `verdict`.
4. **Shape coverage (SC-005).** Defined for a 2-0 (2 games), a 2-1 (3 games), a Time-tiebreak win, an
   exact-tie→defender, a total wipe (0 survivors / 0% hull), an all-survivors game, and a defeat — with no
   missing fields.
5. **Graceful MVP (FR-010).** `mvp` present iff per-machine damage is available; its absence changes nothing
   else.

## Entity relationship summary

```
MatchResult (Feature 1) ─┐
Replay.meta.unitOrder ────┼─ deriveSummaryViewModel(result, ctx) ──> BattleSummaryViewModel (display-only)
Standing delta (Feature 7)┘         ▲                                    │
ctx = { viewerSide, opponent, tickRate, replayRef, standing? }          └─ rendered by src/components/battle-summary/*
Replay.games[].events (Feature 1) ──(optional, once)──> mvp             (Feature 3 tokens/primitives)
```
