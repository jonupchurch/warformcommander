# v3 Counter-Web — Baseline (the v2 "before" picture)

The locked pre-v3 field, measured on the **current seed ruleset** before any slice lands. Every slice
re-measures against this and records its delta below (T014/T024/T034/T042/T049, then T053).

**Instrument** (contract [balancer-verification.md](./contracts/balancer-verification.md)):

```
cargo run -p balancer --release -- verify --field all --seed 1 --samples 250 --out balance-reports
node scripts/field-metrics.js balance-reports/balance-report.json
```

**Provenance**: ruleset hash `503e5b427bfa9f13b968ddcc2a9f649b12197f4264bee33e3d1a41e66665c571` · engine
`0.1.0` · seed 1 · 250 samples/matchup · field `all` (12 archetypes, 132 directional matchups, 33 000
resolutions) · captured 2026-07-23 (T001).

## Green starting state (T002)

`cargo test -p engine` ✅ · `cargo test -p balancer` ✅ · `npm run test -- derive-parity` ✅ 46/46
(derive-parity is green — the fixture is stale-but-consistent, [[derive-battery-fixture-stale]]; the
US2/US4/US5 TS-mirror updates bring it current).

## Field metrics (the counter-web numbers)

| Metric | Baseline | Target (SC) |
|---|---|---|
| Walls (0/100, ≤5% or ≥95%) | **125 / 132 (94.7%)** | fewer |
| Contested (5–95%) | **7 (5.3%)** | rise (SC-001/003) |
| Near-ties (40–60%) | **1** (kinetic-tanks vs ca-attrition = 41.6%) | *retired as a target* (SC-008 — a 50/50 is luck, not a goal) |
| Monotone / total-order | **93.9%** | → ~70% or below (SC-003) |
| Spread (top − bottom win rate) | **84.5 pts** | judge by contested/cycles, **not** spread |
| Median battle duration | **492.5 ticks** (mean 558.3) | within ~10% of 491 (SC-005) → **~442–540** |

## Standings (win rate over all field matchups)

| Rank | Archetype | Win rate | ≈ matchups won (of 11) |
|---|---|---|---|
| 1 | ca-aa | **90.9%** | ~10 |
| 2 | air-alpha | 81.8% | ~9 |
| 2 | ca-air | 81.8% | ~9 |
| 4 | artillery-line | 72.7% | ~8 |
| 5 | energy-mechs | 57.3% | ~6 |
| 6 | ca-line | 54.7% | ~6 |
| 7 | ca-siege | 51.6% | ~6 |
| 8 | ca-mobile | 36.4% | ~4 |
| 9 | ca-attrition | 24.4% | ~3 |
| 10 | kinetic-tanks | 21.1% | ~2 |
| 11 | aa-rocket | 20.9% | ~2 |
| 12 | support-ball | **6.4%** | ~1 |

**Top archetype (ca-aa) wins ~10/11** — the SC-001 "king wins ~10–11" the counter-web must break.

## Invariants (balancer, the four checks)

| Invariant | Band | Measured | Pass |
|---|---|---|---|
| FamilyBonusBand | [0.10, 0.15] | **0.12** (confirms native `+12%` = `native_bonus 1_200`) | ✅ |
| PowerGapCap | [0, 0.5] | 0.3064 | ✅ |
| NoDominantUnit | [0, 0] | 0 | ✅ |
| SkillBeatsGear | [0, 1] | **0.5896** | ✅ (but **energy-vs-armor by construction** — the S0 target, FR-030) |

> **S0 note**: the `0.5896` SkillBeatsGear margin is produced by the *old* fixture, whose skilled side is
> a pure Energy anti-armor brawler — its whole edge is the matrix's Energy ×1.25-vs-armor, so **any**
> structural matrix change moves it. S0 (T003) re-fixtures it to a composition-quality edge and records
> the new value here; the field metrics above are **unaffected by S0** (it only touches invariant
> fixtures, not the field or the ruleset).

## Per-slice deltas (filled in as slices land)

| Slice | Walls | Contested | Monotone | Top WR | Median dur | SkillBeatsGear | Notes |
|---|---|---|---|---|---|---|---|
| **v2 baseline** | 125 | 7 | 93.9% | 90.9% | 492.5 | 0.5896 (old energy fixture) | this file |
| S0 (re-fixture) | 125 | 7 | 93.9% | 90.9% | 492.5 | **−0.403** (composition gate, ❌ red by design) | field/ruleset untouched → field metrics identical; the gate is expected red until US2 makes reach a real counter (T003–T005) |
| US1 (triangle) | | | | | | | contested ↑ / monotone ↓ expected |
| US2 (reach) | | | | | | | reach/kite counter appears |
| US3 (equipment) | | | | | | | a matchup *bends* |
| US4 (behaviors) | | | | | | | duration watch (SC-005) |
| US5 (Commander) | | | | | | | assassinate cycle |
