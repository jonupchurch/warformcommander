# Spec 014 — Diagnosis: why the field is degenerate (the mechanism, confirmed)

**Captured**: 2026-07-22 · **Engine**: live v17 default `503e5b42` (the ruleset in production)
**Method**: three controlled field sweeps (`verify --field all`, seed 1, 250 samples/matchup, 132
matchups) each isolating one candidate mechanism, plus a total-order analysis of the baseline field.
Experiment probes were temporary env-gated toggles in the balancer/engine, reverted after measuring.

This is the "confirm the mechanism first" step the v2 outcome recommended before a content pass. It
answers *why* the field is 92% walls, so spec 014 targets the real cause instead of guessing.

## The question

The v2 pass proved no mechanical lever (damage, stance, support, reactive, air) moves the win-rate
walls, and concluded "it's a content problem." The deeper `balance.md` investigation found something
sharper: **unit value is super-linear in count** (1 flak loses 0–100, 2 flak wins 100–0) and flagged
the unanswered question — *why is the 2nd copy worth so much more than the 1st?* — as gating the whole
content pass. This diagnosis answers it.

## Method — isolate each candidate mechanism, measure the wall count

Each run forces one mechanism off/open field-wide and re-measures how many of 132 matchups are walls
(win rate ≤5% or ≥95%) vs contested (5–95%). If a mechanism were the driver, disabling it would
collapse the walls.

| Lever pulled | Walls / 132 | Contested | Games 2–0 |
|---|---:|---:|---:|
| **Baseline** (stock: FocusFire, FrontReachable) | **125** (94.7%) | 7 | 97.2% |
| Fire concentration OFF (DisperseFire field-wide) | 121 (91.7%) | 11 | 96.2% |
| Reach OPEN + target backline (screens fully bypassed) | 120 (90.9%) | 12 | 95.0% |

Damage magnitude was already established as inert across 11 prior tuning rounds (v5–v11) and the whole
v2 pass. So **all four structural levers — damage, fire allocation, reach/screening — each move ~4
matchups and no more.** They perturb the same thin sliver of near-threshold matchups; ~120/132 never
budge regardless of which mechanic is disabled.

## The root cause — the field is a near-total power order

Ranking the 12 archetypes by across-field win rate and checking every unordered pair:

| Metric (baseline field, 66 pairs) | Value |
|---|---:|
| Pairs where the higher-ranked wins (**monotone**) | **62 / 66 (93.9%)** |
| Near-ties (45–55%) | **0** |
| Upsets (lower-ranked wins) | **4 (6.1%)** |

The field is a **93.9% total order with zero near-ties**: matchups are decided by which composition
ranks higher on a single scalar "power level," and the gaps between compositions are so large that no
situational mechanic reorders the ladder. This is why the standings quantize to a near-perfect
descending list and why eleven rounds of number-tuning only ever flipped one matchup at a time.

**The entire surviving counter-web is 4 relationships** — the only counters strong enough to punch
through the power gap:

- `aa-rocket` (rank 10) beats `ca-aa` (rank 0) and `air-alpha` (rank 1) **100%** — dedicated anti-air
  hard-counters air from the bottom of the ladder.
- `ca-siege` beats `energy-mechs` 64%; `support-ball` beats `aa-rocket` 70%.

Note what those 4 are: **capability/reach counters** (can you target the Air zone or not), not
damage-matrix counters. The damage triangle (kinetic/energy/explosive × armor/shield/ablative) at its
current ±40% is far too weak to overturn a rank gap, so it never appears as an upset. The counters
that *work* are binary capability gates — which is also why they read 100–0, not contested.

## The tension the success criteria hid

Two v2 criteria that looked aligned actually pull in **opposite** directions on this field:

- **SC-002 (spread / no dominant)** wants *cycles*: something must beat the top composition. That needs
  **stronger counters** — but strong counters are binary (100–0), which *adds* walls.
- **SC-001 (contested matchups, 40–60%)** wants *parity*: matchups near 50/50. That needs the **power
  gaps flattened** so more matchups land near even — the opposite of sharpening hard counters.

You cannot get both from one lever. Hard capability counters fix the spread and the "no unbeatable
army" goal but stay 100–0; flattening power gaps creates contested matchups but, alone, collapses the
counter-web into coin-flips.

## Implication for spec 014 — the fix has two independent axes

1. **Flatten the power dimension.** Reduce the composition-to-composition power gaps so outcomes stop
   being a pure ranking — the direct attack on the super-linearity (`2 units ≫ 2 × 1 unit`). Levers:
   diminishing returns on stacking identical units, a squad power budget, or normalizing effective
   combat power. Makes matchups land near parity so *something else* can decide them. **Mechanics.**
2. **Add graded counter-play in that newly-flat space.** With power gaps flat, give compositions
   *soft* counters (a tilt, not a switch) so a countering-but-equal army wins 60/40 instead of 50/50 —
   contested matchups whose winner is the better *counter-match*, which is the "planning beats gear"
   design goal. Keep a few *hard* capability counters (AA→air) for the hard-counter fantasy, as the
   minority. **Content + a small amount of mechanics.**

The v2 pass built the mechanical vocabulary (defense families, reach tiers, air contest) this fix will
use. But the leading lever is **#1 (flatten power gaps)** — until compositions are near-parity, no
amount of new counter content will produce contested matchups, only more 100–0 walls. That is the
correction to "just add weapons": added content on the current steep ladder becomes more binary
counters, not more contests.

## Reproduce

Temporary env-gated probes (reverted): `WFC_FORCE_RULE=disperse`, `WFC_REACH_OPEN=1` +
`WFC_FORCE_ROW=last`, applied in `balancer::sweep::run_sweep` / `engine::sim::target::reach_zones`,
then `verify --field all --seed 1 --samples 250`. Order analysis: rank by across-field win rate, count
pairs where the higher rank wins. Scripts in the session scratchpad (`count-walls.js`,
`order-check.js`).
