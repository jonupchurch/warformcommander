//! US3 T019–T022 — SC-004: the four balance invariants are **evaluated and reported** with measured
//! numbers + margins on the baseline table (and all pass on it), and on four fixtures that each
//! deliberately violate one invariant, **each violation is detected as a fail**. These fixtures are
//! the balancer's own golden tests — they prove it catches what it exists to catch.

use balancer::archetypes::default_field;
use balancer::fixtures;
use balancer::invariants::{
    family_bonus_band, no_dominant_unit, power_gap_cap, skill_beats_gear, verify, InvariantConfig,
};
use balancer::report::model::InvariantName;
use balancer::sweep::{run_sweep, SweepConfig};

fn cfg() -> InvariantConfig {
    InvariantConfig {
        base_seed: 1,
        samples: 150,
        threads: None,
    }
}

#[test]
fn baseline_evaluates_and_passes_all_four() {
    let rs = fixtures::fair_baseline();
    let checks = verify(&default_field(), &rs, &cfg());
    assert_eq!(checks.len(), 4, "all four invariants evaluated");
    for c in &checks {
        assert!(
            c.measured.is_finite(),
            "{:?} must report a measured number",
            c.name
        );
        assert!(
            c.pass,
            "{:?} should pass on the baseline (measured {}, margin {})",
            c.name, c.measured, c.margin
        );
    }
    // Family bonus lands right around the +12% default.
    let fam = checks
        .iter()
        .find(|c| c.name == InvariantName::FamilyBonusBand)
        .unwrap();
    assert!(
        (0.10..=0.15).contains(&fam.measured),
        "family bonus measured {}",
        fam.measured
    );
}

#[test]
fn family_bonus_violation_is_detected() {
    let rs = fixtures::family_bonus_violation();
    let c = family_bonus_band(&rs, &cfg());
    assert!(!c.pass, "an out-of-band native bonus must fail");
    assert!(
        c.measured > 0.15,
        "measured {} should exceed the band",
        c.measured
    );
    assert!(c.margin < 0.0, "a failing check reports a negative margin");
}

#[test]
fn power_gap_violation_is_detected() {
    let rs = fixtures::gear_overwhelms();
    let c = power_gap_cap(&rs, &cfg());
    assert!(!c.pass, "a blown-out gear gap must fail the power-gap cap");
    assert!(
        c.measured > 0.5,
        "survivor margin {} should exceed the cap",
        c.measured
    );
}

#[test]
fn no_dominant_unit_violation_is_detected() {
    let rs = fixtures::dominant_unit_violation();
    let sweep = run_sweep(
        &default_field(),
        &rs,
        &SweepConfig {
            base_seed: 1,
            samples_per_matchup: 120,
            threads: None,
            ..Default::default()
        },
    );
    let c = no_dominant_unit(&sweep);
    assert!(
        !c.pass,
        "an unkillable air alpha clean-sweeps → the no-dominant-unit invariant fails"
    );
    assert!(
        c.measured >= 1.0,
        "at least one clean-sweeper, got {}",
        c.measured
    );
}

#[test]
fn skill_beats_gear_violation_is_detected() {
    let rs = fixtures::gear_overwhelms();
    let c = skill_beats_gear(&rs, &cfg());
    assert!(
        !c.pass,
        "when gear overwhelms skill the base-gear side loses → fail"
    );
    assert!(
        c.measured < 0.0,
        "the sloppy max-gear side out-survives → negative margin, got {}",
        c.measured
    );
}
