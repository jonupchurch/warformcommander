# US4 Air — staged measurement log

The air work is the one slice that changes the **stock field**, so FR-030 mandates one change at a
time, measured after each, each independently reversible. Field: `verify --field all`, seed 1, 132
matchups, 2000 samples. Standings are aggregate win rate; the two archetypes that matter here are
**air-alpha** (the aircraft archetype) and **aa-rocket** (dedicated anti-air).

## The problem being targeted (v11 baseline → current)

| Archetype | v11 baseline | post-US1/US3 (current) |
|---|---:|---:|
| ca-aa (combined-arms **with** AA) | 90.9% | 90.9% |
| **air-alpha** (aircraft) | 81.8% | 81.8% |
| ca-air | 81.8% | 81.8% |
| **aa-rocket** (dedicated AA) | 24.6% | 21.2% |
| support-ball (field floor) | 3.8% | 7.2% |

The inversion: anti-air **as a component** (ca-aa) is the strongest thing in the game, while anti-air
**as an archetype** (aa-rocket) is near the bottom. Note aa-rocket is **not actually last** (support-ball
is lower) — so SC-009 ("dedicated AA no longer the field's lowest archetype") was already satisfied at
baseline, and the real intent is the air/AA inversion, not the literal ranking.

## Stage 5a — Heli rebase (shipped in US1)

The Helicopter was rebased in US1 (Gunship hull cut with the chassis pass). **Measured: no change to the
air matchup.** air-alpha is 81.8% both before and after; aa-rocket 24.6% → 21.2% (drifted *down*, from
the US1 defense redistribution, not up). The rebase did not touch the inversion.

## Stage 5b — energy weapons contest air (`energy_air_dmg_mult = 7500`, ×0.75)

Energy weapons made air-capable at an intermediate damage rate (×0.75, strictly between plink ×0.5 and
flak ×1.0), reachable only from the front line so dedicated AA keeps its whole-field reach advantage
(FR-028/029). Measured ON vs OFF:

| Archetype | OFF | ON | Δ |
|---|---:|---:|---:|
| ca-aa | 90.9 | 81.9 | **−9.0** |
| air-alpha | 81.8 | 81.8 | **+0.0** |
| energy-mechs | 57.2 | 66.2 | **+9.0** |
| aa-rocket | 21.2 | 21.2 | **+0.0** |
| *(all 8 others)* | — | — | 0.0 |

Degenerate sweeps (0/100 matchups): **123 → 123** — unchanged.

### What this means

- **air-alpha is a wall.** Giving the whole field a partial air answer moved the aircraft archetype's
  win rate by **zero**. Its 81.8% is decided by hard-counter relationships that an improvised energy
  rate does not touch — the same structural degeneracy every other v2 lever hit.
- **aa-rocket is unmoved.** Energy-air did **nothing** for dedicated AA. Its weakness is orthogonal (a
  pure-AA army has nothing to do once the skies are clear), so SC-009's intent is not advanced by this
  lever.
- The entire effect is a **lateral 9-point transfer** from ca-aa to energy-mechs: energy-mechs can now
  do a slice of what ca-aa did, so ca-aa loses its air-monopoly edge and energy-mechs gain one. Not a
  rebalance — a reshuffle, with the walls intact.
- **SC-010 (air stays viable) trivially holds** — air is at 81.8%, well inside (indeed above) any
  viability band. The risk the spec worried about (deleting air) did not materialise because the lever
  is too weak to move air at all.

## Decision

Per FR-030 the change is **shipped off by default** (`energy_air_dmg_mult = 0`) — implemented, tested,
and independently reversible, but not activated on the stock field. Turning it on is balance-inert for
US4's goals (air unmoved, dedicated AA unmoved) while shifting 9 points laterally, so **it is not worth
activating on its own**, and the later stages (5c Rocket Pack, 5d `aa_focus_per_air`) target the same
wall with even smaller levers.

This is the **fifth** confirmation of the feature's thesis: single mechanical levers cannot move a
92%-wall field. The air inversion, like the rest of the field, needs the content expansion (new
weapons/roster giving the damage matrix contested matchups) — not another air knob. Recommendation
carried to the outcome record; the mechanic remains available for that later pass.
