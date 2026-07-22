# v11 Baseline — Fragile-Chassis Survival (SC-008)

**Captured**: 2026-07-22 · **Ruleset hash**: `5171948baaf531cc9d4eea07a0d810baa2469474dd3c7ccff40a422e83aaa4a0`
**Tool**: `cargo run -q -p engine --example survival_probe --release` · 400 seeds

The aggregate balance report gives win rates, not per-chassis survival, so
[`survival_probe.rs`](../../../crates/engine/examples/survival_probe.rs) fills the gap. One fixed
attacker army (SAM + two heavy tanks + mech + artillery, so every zone is reachable) faces one fixed
defender holding exactly one of each fragile chassis in its home zone behind a two-tank screen.

**Re-run this after v12.** SC-008 requires these numbers to go **down or stay level**, never up.

## Baseline

| Chassis | Mean death tick | Median | Earliest | Survived the battle |
|---|---:|---:|---:|---:|
| Helicopter (Gunship) | **48.2** | 48 | 33 | **0%** |
| Artillery (Longbow) | **237.0** | 240 | 183 | 57% |
| RocketArtillery (Sentry) | **201.0** | 201 | 155 | 34% |

## What this actually shows

**The helicopter is the most fragile thing in the game, not the toughest.** It dies at tick 48 —
roughly a fifth as long as the artillery lasts — and it never once survived across 400 seeds. That is
the opposite of the reported feel, and it matters a great deal for US4.

It corroborates the balance report exactly: `aa-rocket` beats `air-alpha` **100–0**, and `air-alpha`
loses to `ca-aa` 0–100. Anti-air does not need buffing against helicopters. When a counter is on the
field, the helicopter evaporates.

So the reported "helicopters survive far too long against AA" is not about durability. **It is about
armies that have no answer at all** — where the helicopter sits in the Air zone and simply cannot be
targeted, making its effective survivability infinite rather than 48 ticks. The problem is binary
reachability, not hit points.

**This sharpens US4 considerably.** Buffing anti-air damage or raising the focus cap would make an
already-100–0 matchup more lopsided while doing nothing about the case the user actually hit. The
change that addresses the real complaint is the one giving armies *without* a dedicated counter some
recourse — letting energy weapons engage air. The other three staged changes now look far less
necessary and should be judged sceptically against this evidence when their stages come up.

## Consequence for the v12 rebase

The helicopter has **no headroom to lose**. It already dies in 48 ticks and never survives. Cutting
its durability further would be tuning a number that is not the problem, and it risks making air
useless the moment US4's changes land on top.

For v12 the helicopter should be rebased to land **level with** this baseline rather than below it,
with the defense slot changing *what* kills it rather than *how fast*. Artillery and Rocket-Artillery
have real headroom (57% and 34% survival) and can absorb the intended cut.

This is a deliberate narrowing of FR-011, recorded here rather than silently applied — the
requirement was written before this measurement existed.
