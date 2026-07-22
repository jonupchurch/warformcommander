# v11 Baseline — Comparison Points

**Captured**: 2026-07-22 · **Ruleset hash**: `5171948baaf531cc9d4eea07a0d810baa2469474dd3c7ccff40a422e83aaa4a0`
**Command**: `cargo run -q -p balancer --release -- verify --field all --out specs/013-v2-ruleset/baseline`
**Scale**: 12 archetypes · 132 matchups · 2000 samples each · 264,000 resolutions · seed `1`

This is the measurement everything in [spec.md](../spec.md) is compared against. It is **irrecoverable
once the catalog changes** — the v12 defense rebuild rewrites the content this describes.

## Headline: the field is 92% degenerate

| Metric | Value |
|---|---:|
| Matchups resolving as total sweeps (0% or 100%) | **121 of 132** |
| Contested matchups (5–95%) | **8 of 132 (6.1%)** |
| Archetypes flagged by the balancer | **9 of 12** |
| Median battle duration | **484.8 ticks** |
| Mean battle duration | 548.6 ticks |

The four balance invariants all pass — native-bonus band 0.120, power-gap 0.428, no-dominant-unit
0.000, skill-beats-gear 0.387 — which is precisely the point made in the spec's Overview. **The
invariants are green while the field is a wall.** They measure the wrong thing, so they cannot see
this problem, and the auto-balancer's flag list is what actually carries signal here.

## Standings (aggregate win rate)

| Archetype | Win rate | |
|---|---:|---|
| ca-aa | 90.9% | flagged |
| air-alpha | 81.8% | flagged |
| ca-air | 81.8% | flagged |
| artillery-line | 72.7% | flagged |
| energy-mechs | 59.7% | |
| ca-line | 54.0% | |
| ca-siege | 50.6% | |
| ca-mobile | 36.4% | |
| aa-rocket | 24.6% | flagged |
| kinetic-tanks | 23.8% | flagged |
| ca-attrition | 23.4% | flagged |
| support-ball | 3.8% | flagged |

**Spread: 87.1 points** (3.8% → 90.9%).

Because 121 of 132 matchups are sweeps, these aggregates are very nearly a *count of how many
opponents each archetype hard-counters* divided by 11. They are not a power ranking, and moving them
with damage numbers has failed eleven times.

## The 8 contested matchups

These are the only places in the entire field where a battle is genuinely in doubt. Everything else is
decided before it starts.

| Matchup | Win rate A |
|---|---:|
| aa-rocket vs support-ball | 70.3% |
| kinetic-tanks vs ca-attrition | 62.3% |
| ca-attrition vs kinetic-tanks | 57.0% |
| energy-mechs vs ca-siege | 57.1% |
| ca-siege vs energy-mechs | 44.1% |
| support-ball vs aa-rocket | 42.3% |
| ca-line vs ca-siege | 92.3% |
| ca-siege vs ca-line | 12.2% |

Only **three distinct pairings** account for six of the eight (they appear from both sides).

## Air and anti-air — the US4 comparison point

| Archetype | Win rate | Note |
|---|---:|---|
| ca-aa | 90.9% | combined-arms **with** anti-air is the strongest thing in the game |
| air-alpha | 81.8% | air is second |
| ca-air | 81.8% | |
| aa-rocket | 24.6% | **dedicated** anti-air is fourth from bottom |

This is the inversion the spec describes, and it is sharper than expected: anti-air *as a component of
a mixed army* is dominant, while anti-air *as an archetype* is near-dead. That distinction matters for
US4 — the problem is not that anti-air is weak, it is that a pure anti-air army has nothing to do once
the skies are clear.

Notable: `aa-rocket vs air-alpha` is 100% and `air-alpha vs ca-aa` is 0%. Anti-air already beats air
decisively when it is present. The user-reported "helicopters survive too long" is therefore about
armies *without* a dedicated counter, which is exactly what US4 targets.

## Corrections applied to the spec

The success criteria were originally written from recalled figures for the 6-archetype mono field.
Measured values on the field actually used (`--field all`, 12 archetypes) are materially worse, and
SC-001, SC-002, and SC-005 were updated to match.

| Criterion | Written from memory | Measured |
|---|---|---|
| SC-001 contested | 6 of 30 | **8 of 132** |
| SC-002 spread | 20%–64% | **3.8%–90.9%** |
| SC-005 duration | "baseline" | **484.8 ticks median** |

## Still to capture

- **SC-003** — shielded/ablative share of field effective HP. The ~3% figure is from a prior manual
  count of variants carrying shields; it is not in this report and needs deriving from the ruleset.
- **SC-008** — focused-fire survival ticks for Heli / Artillery / RocketArtillery, which the aggregate
  report does not break out. This is task T006 and must be done before v12 lands.

## Raw artifacts

- [balance-report.md](./balance-report.md) — full human-readable report
- [balance-report.json](./balance-report.json) — canonical JSON, 132 matchups with CIs
