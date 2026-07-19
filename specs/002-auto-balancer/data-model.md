# Data Model: Auto-balancer (Monte-Carlo)

**Feature**: `002-auto-balancer` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

The balancer **reuses Feature 1's game-data model** — it does not redefine it. `Army`,
`Ruleset`, `MatchConfig`, `MatchResult`, and the whole content/ruleset schema live in
[Feature 1's data-model](../001-battle-sim-core/data-model.md) and are imported from the
`engine` crate as-is (constitution **P6/P8** — one engine, one source of truth). This document
defines **only the balancer-specific types**: the sweep configuration it reads, the estimates it
computes, and the report it emits. All of these live in the `crates/balancer` crate; the report
types are `serde`-derived (the [balance-report contract](./contracts/balance-report.md) is their
wire shape).

## Reused from Feature 1 (imported, not redefined)

| Type | Source | Role in the balancer |
|---|---|---|
| `Army` / `Squad` | [F1 data-model → Squad/Army](../001-battle-sim-core/data-model.md#squad--army) | the two sides of a `MatchupSpec`; sweep candidates are `Army` values |
| `Ruleset` | [F1 data-model → Tier 2](../001-battle-sim-core/data-model.md#tier-2--ruleset-the-balance-table-engine-input) | the **balance table** read as data (FR-017); **never mutated** (FR-018) |
| `MatchConfig` | [F1 data-model → Game/Match](../001-battle-sim-core/data-model.md#game--match-fr-019-fr-020) | balancer always runs `adaptation: Free`, `bestOf: 3` |
| `MatchResult` | [F1 data-model → BattleResult](../001-battle-sim-core/data-model.md#battleresult-summary--fr-022) | the per-match outcome the batch aggregates (winner + condition + damage totals) |
| `resolve()` / `validate()` | [F1 engine-api contract](../001-battle-sim-core/contracts/engine-api.md) | the **only** engine surface the balancer calls (natively) |
| `rulesetHash` | [F1 data-model → Tier 2](../001-battle-sim-core/data-model.md#tier-2--ruleset-the-balance-table-engine-input) | stamped into every report for provenance (FR-019, SC-007) |

> The balancer imports these; it **adds no field** to them and **holds no second copy** of the
> game rules. If the engine model changes, the balancer recompiles against it — there is no drift
> surface (P6).

---

## Balancer-specific types

### MatchupSpec

One pairing to evaluate. The atom US1 operates on.

| Field | Type | Notes |
|---|---|---|
| `sideA` | `Army` | index 0 = attacker (F1 convention). |
| `sideB` | `Army` | index 1 = defender = the exact-damage-tie winner (F1 §9.3). |
| `matchConfig` | `MatchConfig` | fixed `{ adaptation: Free, defenderSide: B, bestOf: 3 }` for balancing. |
| `label` | `String?` | human tag for reports (e.g. "Energy-Mech vs Grizzly"). |

### BatchConfig

How to sample one matchup (US1).

| Field | Type | Notes |
|---|---|---|
| `baseSeed` | `u64` | the single seed the batch is reproducible from (FR-002). |
| `samples` | `u32` | N = number of seeded Bo3 resolutions (default ~1500–2000 for ≤±2.5% half-width, research B1). |
| `threads` | `u32?` | rayon worker count; **must not change the aggregate** (FR-004, SC-001). |

> **Per-match seed** = `derive(baseSeed, matchIndex)` — a value-stable integer mix
> (`seed.rs`, research A1). Match *i* always uses the same seed regardless of which thread runs
> it, so the batch is reproducible and thread-count-independent.

### WinRateEstimate

The aggregated result of one matchup batch (US1). **Counts are integer + deterministic; the
interval is float, computed once and rendered at fixed precision** (spec Assumptions).

| Field | Type | Notes |
|---|---|---|
| `samples` | `u32` | N actually resolved (excludes skipped-invalid, FR-005). |
| `winsA` / `winsB` | `u32` | integer win counts — the deterministic, order-independent aggregate (FR-003). |
| `winRateA` | `f64` (rendered fixed-precision) | `winsA / samples`. |
| `ci95` | `Interval { low, high }` | **Wilson 95%** interval on `winRateA` (research B1). |
| `outcomeBreakdown` | `OutcomeBreakdown` | how it was won (below). |

**OutcomeBreakdown** — *how*, not just *who*:

| Field | Type | Notes |
|---|---|---|
| `conquestA` / `conquestB` | `u32` | games won by wipe. |
| `timeTiebreakA` / `timeTiebreakB` | `u32` | games won on the damage-dealt tiebreak (§9.3). |
| `matchSplit` | `{ twoZero: u32, twoOne: u32 }` | Bo3 game-count distribution. |
| `avgDurationTicks` | `f64` | mean battle length (a low value + all-Time = a degenerate-turtle signal). |

### SweepConfig

The parameter space + field + thresholds US2/US3 read. **Authored data** (FR-006).

| Field | Type | Notes |
|---|---|---|
| `axes` | `SweepAxis[]` | which axes to vary and over which values: `Type`, `Variant`, `Loadout`, `Dials`, `Positioning`. |
| `field` | `Army[]` | the **reference field** each candidate is tested against (research A2) — bounded, curated. |
| `samplesPerMatchup` | `u32` | N per candidate-vs-field cell. |
| `baseSeed` | `u64` | reproducibility root for the whole sweep. |
| `fairBand` | `{ floor: f64, ceiling: f64 }` | default `{ 0.40, 0.60 }` — the band a flag's interval must clear (research C1); **configurable policy**, not baked. |
| `budget` | `ResolutionBudget?` | a cap that bounds/samples the candidate set to stay within SC-005; the report records the coverage actually achieved. |

**SweepAxis** = `{ axis: AxisKind, values: Vec<AxisValue> }`. The Cartesian product of the axes
(intersected with mount/zone legality) is the candidate set; if it exceeds `budget`, the sweep
**samples** it (recording coverage) rather than truncating silently.

### FlaggedCombo

One outlier the sweep surfaced (US2).

| Field | Type | Notes |
|---|---|---|
| `combo` | `Army` (or a `ComboRef` into the sweep) | the flagged configuration. |
| `acrossFieldWinRate` | `f64` + `ci95` | its aggregate vs the field (interval-gated flagging, FR-011). |
| `kind` | `Dominant \| Degenerate \| Underpowered` | the flag class (research C1). |
| `reason` | `String` | e.g. "interval above ceiling", "wins all field matchups", "Plan-B with no trade-off (§8.2)". |
| `severity` | `f64` | distance of the interval from the nearest band edge; **sorts the list worst-first** (FR-010). |

### InvariantCheck

One of the four balance-invariant results (US3). Reports the **number and margin**, never a bare
boolean (FR-016).

| Field | Type | Notes |
|---|---|---|
| `name` | `FamilyBonusBand \| PowerGapCap \| NoDominantUnit \| SkillBeatsGear` | the four claims (FR-012–015). |
| `band` | `{ low: f64, high: f64 }` | the intended band (e.g. family bonus 0.10–0.15; power-gap ≤ moderate cap). |
| `measured` | `f64` | the number read from the head-to-head distributions. |
| `margin` | `f64` | signed distance from the nearest band edge (negative = out of band). |
| `pass` | `bool` | derived: `measured` within `band` (with statistical gating). |
| `evidence` | `MatchupRef[]` | the matchups the measurement came from (auditability). |

### BalanceReport (primary output — FR-019/020/021)

The aggregate artifact the designer reads. Serialized to JSON (canonical) + markdown (rendering);
see the [balance-report contract](./contracts/balance-report.md).

| Field | Type | Notes |
|---|---|---|
| `provenance` | `Provenance` | `{ rulesetHash, engineVersion, replayFormatVersion, generatedAt }` — the traceability stamp (SC-007). |
| `runConfig` | `RunConfig` | the base seed, sample sizes, sweep scope, and fair band the run used (so the report is self-describing). |
| `matchups` | `MatchupResult[]` | per-matchup `{ MatchupSpec.label, WinRateEstimate }`. |
| `flagged` | `FlaggedCombo[]` | severity-sorted (FR-010). |
| `invariants` | `InvariantCheck[]` | the four checks (FR-016). |
| `coverage` | `Coverage` | candidates evaluated / total space, samples/matchup, skipped-invalid count (honest coverage, FR-005/006). |

> The report is **advisory** — it names what to tune, it does not tune (FR-018). It holds **no
> mutation of the Ruleset**; SC-006 verifies the input Ruleset is byte-identical after a run.

---

## Entity relationship summary

```
Ruleset (F1, read-only) ─┐
Army × Army ─────────────┼─> MatchupSpec + BatchConfig ──batch (resolve() ×N, rayon across matches)──> WinRateEstimate
                         │
SweepConfig ──enumerate──> candidate Army[] × field Army[] ──batch each──> FlaggedCombo[] (interval-gated, severity-sorted)
SweepConfig + fixtures ──verify──> InvariantCheck[4] (family band · power-gap · no-dominant-unit · skill>gear)

WinRateEstimate[] + FlaggedCombo[] + InvariantCheck[] + Provenance(rulesetHash,versions) ──> BalanceReport ──> {JSON, markdown}
```

Every arrow that touches the sim is a call into the **one** Feature 1 `engine` crate; the balancer
adds only aggregation and presentation around it (no engine logic, no balance mutation).
