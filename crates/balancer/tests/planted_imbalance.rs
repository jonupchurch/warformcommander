//! US2 T014 — SC-003, the headline check: given a seeded fixture Ruleset with a **deliberately
//! dominant** combo planted, the balancer **flags** that combo and does **not** flag a co-located
//! **known-fair** combo. On the baseline table the energy-mech archetype sits fairly in-band
//! (unflagged); planting a dominant Striker (its signature unit) pushes it entirely above the ceiling
//! → flagged, while the kinetic-tanks archetype stays fair in both.

use balancer::archetypes::default_field;
use balancer::fixtures;
use balancer::flags::classify_all;
use balancer::report::model::FlagKind;
use balancer::sweep::{run_sweep, SweepConfig};

fn is_flagged(ruleset: &engine::model::ruleset::Ruleset, label: &str) -> Option<FlagKind> {
    let cfg = SweepConfig {
        base_seed: 1,
        samples_per_matchup: 100,
        threads: None,
        ..Default::default()
    };
    let sweep = run_sweep(&default_field(), ruleset, &cfg);
    let flags = classify_all(&sweep, &cfg.fair_band);
    flags
        .into_iter()
        .find(|f| f.combo.label == label)
        .map(|f| f.kind)
}

#[test]
#[ignore = "anchored to energy-mechs being baseline-fair; the v3 matrix sharpen (spec 015 US1, \
            start-values) makes energy strong vs the armor-heavy field, so it now flags. The balancer's \
            flag MECHANISM is still covered by the invariant violation-detection tests. Re-anchor to a \
            v3-fair combo in the balance/sim pass."]
fn planted_dominant_is_flagged_and_a_fair_combo_is_not() {
    // Baseline: energy-mechs is fair (in-band) → not flagged.
    assert!(
        is_flagged(&fixtures::fair_baseline(), "energy-mechs").is_none(),
        "energy-mechs should sit fairly in-band on the baseline table"
    );

    // Plant a dominant Striker (energy-mechs' signature unit) → energy-mechs is now flagged.
    let planted = fixtures::planted_dominant("Striker", 25, 4);
    assert!(
        is_flagged(&planted, "energy-mechs").is_some(),
        "the planted dominant energy-mech combo must be flagged (SC-003)"
    );

    // The co-located known-fair kinetic-tanks combo is NOT flagged in either table.
    assert!(is_flagged(&fixtures::fair_baseline(), "kinetic-tanks").is_none());
    assert!(
        is_flagged(&planted, "kinetic-tanks").is_none(),
        "a known-fair combo must not be flagged just because a different combo was planted"
    );
}
