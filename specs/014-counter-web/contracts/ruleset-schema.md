# Contract — Ruleset schema & measurement (Counter-Web)

The engine's external contracts touched by this feature: the **Ruleset data schema** (sim/balancer/web
read it) and the **balancer measurement report** (the acceptance instrument). Both must stay
backward-compatible and deterministic.

## Ruleset schema additions

### `Coordination` (new)

```
Coordination {
  returns: [Bp]        // returns[0] == 10000; each in [0, 10000]; index past end clamps to last
  grain:   "Type" | "TypeVariant"          // default "Type"
  scales:  "Offense" | "OffenseAndSurvivability"  // default "Offense"
}
Ruleset.coordination: Coordination   // #[serde(default, skip_serializing_if = "is_default")]
```

**Contract guarantees**:

- **Default is identity.** The default (`returns = [10000]`, or all-`10000`) reproduces current
  behavior exactly and **skips serialization** → the seed ruleset hash is unchanged and goldens are not
  re-blessed until the seed sets a real curve. (The v2 serde hash-stability trick.)
- **Forward/backward compatible.** An older engine reading a ruleset without `coordination` gets the
  default; a newer engine reading an old ruleset gets the default. No enum-variant hazard (it is a
  *field*, not a new enum variant), so — unlike v2's `Ablative`/`Aura`/`RocketPack` — it carries **no
  deploy-before-reseed requirement** on its own.
- **Deterministic application.** Duplicate rank is computed in existing instance order; scaling is
  fixed-point `mul_bp`. native==wasm byte-identical.

### Existing tables (re-tuned, no schema change)

`DamageMatrix`, `role_damage_bonuses`, `air_mods` — magnitudes only. Validation ranges unchanged
(matrix multipliers stay within existing bounds; `plink_acc`/`flak`/`energy_air` ordering preserved).
The TS `validateRuleset` mirror must accept the new magnitudes and the `Coordination` table.

## Balancer measurement report (the instrument)

No breaking change to `balance-report.json`. The feature's two acceptance metrics are **derived** from
the existing `matchups[].winRateA` field; they are added either as a committed sidecar script
(`scripts/field-metrics.js`) or folded into the report — a tasks-level choice.

**Metric contract** (computed from `matchups[]`, 132 entries):

| Metric | Definition |
|---|---|
| walls | count of `winRateA ≤ 0.05 ∥ ≥ 0.95` |
| contested | count of `0.05 < winRateA < 0.95` |
| near-ties | count of `0.40 ≤ winRateA ≤ 0.60` |
| monotone rate | over the 66 unordered pairs, fraction where the higher across-field-ranked archetype wins the pairing |

Baseline (live v17, seed 1, 250 samples): walls 125 · contested 7 · near-ties 0 · monotone 93.9%.

## Invariants that gate every slice (unchanged contract)

`native-family-bonus ∈ [0.10, 0.15]` · `power-gap-cap ≤ 0.5` · `no-dominant-unit == 0` ·
`skill-beats-gear > 0`. A slice that reddens any of these is rejected regardless of its field effect
(the v7–v11 `skill-beats-gear` ceiling is the cautionary precedent).
