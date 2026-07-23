# Phase 1 Data Model — Counter-Web

All content is typed ruleset data (P8), read by the sim, the balancer, and the web mirror from one
source of truth. This feature adds **one** new ruleset table (Axis A) and **re-tunes existing** tables
(Axis B). No new unit types (P3).

## New — `Coordination` (Axis A)

A per-duplicate effectiveness curve, applied at derive time. Mirrors the existing `MountScale` shape
(a small typed struct with a `Default`, an `is_default` for hash-stable serialization, and a lookup).

| Field | Type | Meaning |
|---|---|---|
| `returns` | `Vec<Bp>` (or fixed `[Bp; N]`) | Effectiveness of the 1st, 2nd, … Nth identical unit in an army. `returns[0]` is normally `10000` (×1.0). Index past the end clamps to the last value. |
| `grain` | enum `{ Type, TypeVariant }` | What counts as "identical" — same machine **type** (default, leaning per research D1) or same type+variant. |
| `scales` | enum `{ Offense, OffenseAndSurvivability }` | Which stats the factor scales. Default **Offense** (research D1). |

**Placement**: `Ruleset.coordination: Coordination`, beside `mount_scale`, with
`#[serde(default, skip_serializing_if = "Coordination::is_default")]` so a default (all `10000`, i.e.
the current behavior) serializes to nothing → **hash-stable, no golden re-bless until the seed sets a
real curve** (the v2 serde trick).

**Derivation rule** (`army.rs`, the one engine hook):

1. When building combatants, compute each unit's **duplicate rank** within its army under `grain`
   (0 for the first occurrence in instance order, 1 for the second, …). Deterministic ordering by
   existing instance order — no RNG.
2. Look up `factor = returns[min(rank, len-1)]`.
3. Scale the derived `damage` (and, if `scales == OffenseAndSurvivability`, `hull`/`shield_cap`) by
   `factor` via `mul_bp`, exactly as `mount_scale` scales defensive magnitude today.

**Validation** (server `ruleset-validate` + engine): `returns` non-empty; each entry in `[0, 10000]`
(a duplicate is never *more* effective — monotonic non-increasing is expected but the hard bound is
`≤ 10000` to keep it lateral, P1); `returns[0] == 10000` (the first copy is always full).

**Determinism**: integer/fixed-point, derive-time, ordered — native==wasm byte-identical (P6). Because
the default is the identity curve and skips serialization, **the stock field is unchanged until the
seed opts in** (A1's first measured change).

## Re-tuned — existing counter tables (Axis B)

No schema change; magnitudes move within existing structures. Each remains **lateral** (symmetric), so
strengthening a counter never becomes a straight upgrade (FR-007, P1).

| Table (existing) | Field(s) | Change | Guard |
|---|---|---|---|
| `DamageMatrix` | family × defense-layer multipliers | Widen the swing from ~±40% toward a stronger tilt (exact value tuned on the field) so a countered layer takes materially more, but **not lethal** (still fights). | Symmetric: raising energy-vs-armor raises kinetic-vs-shield too. `skill-beats-gear` invariant gates it. |
| `role_damage_bonuses` | `mult`, `vs` sets | Add/strengthen graded role counters (e.g. a class that punishes a specific target family) as a *tilt*. | Situational (only live vs the named target); lateral. |
| `air_mods` / reach | `energy_air_dmg_mult` (shipped 0), flak/plink rates, reach tiers | Optionally enable the dormant energy-air contest as a *graded* air answer for comps without dedicated AA (turns the AA→air hard wall into a partial one for some comps). | Keep `plink < energy_air < flak` ordering; AA→air stays ≥80% (SC-006). |

## Unchanged

- Unit **types/variants** — none added (P3).
- The **defense families / reach tiers / stance / support** vocabulary from v1/v2 — reused as-is.
- The **balancer archetypes** — the measurement field is held constant for comparability
  (extended only if a coverage gap surfaces; noted in the report if so).

## Web mirror (P7/P8)

- `sim/ruleset.ts` + `sim/derive.ts`: mirror the `Coordination` table and its derive application, so the
  Garage/Customize preview matches the engine (the existing mirror-parity contract).
- `lib/garage/explain.ts`: a "why" line for the coordination effect ("3rd HeavyTank — coordination ×0.75")
  so the Customize screen explains it (P7 text; no new layout).
