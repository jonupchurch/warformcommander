//! US1 T009 — SC-001 reproducibility: the batch aggregate is **identical** single-threaded vs
//! multi-threaded and across repeated runs (per-match seeding + integer reduction → thread-count-
//! independent, FR-004). This is the balancer's load-bearing guarantee — a report is scientific
//! evidence, not a one-off.

use balancer::archetypes::default_field;
use balancer::archetypes::{energy_mechs, kinetic_tanks};
use balancer::batch::{run_batch, BatchConfig, MatchupSpec};
use balancer::sweep::{run_sweep, SweepConfig};
use engine::content::seed_ruleset;

#[test]
fn batch_is_thread_count_independent_and_repeatable() {
    let rs = seed_ruleset();
    let m = MatchupSpec::new(kinetic_tanks(&rs), energy_mechs(&rs), "kinetic vs energy");

    let one = run_batch(
        &m,
        &rs,
        &BatchConfig {
            base_seed: 99,
            samples: 300,
            threads: Some(1),
        },
    );
    let eight = run_batch(
        &m,
        &rs,
        &BatchConfig {
            base_seed: 99,
            samples: 300,
            threads: Some(8),
        },
    );
    let again = run_batch(
        &m,
        &rs,
        &BatchConfig {
            base_seed: 99,
            samples: 300,
            threads: Some(4),
        },
    );

    // Byte-identical integer counts AND identical derived floats (same integer source).
    assert_eq!(one, eight, "1-thread vs 8-thread aggregates diverged");
    assert_eq!(one, again, "repeated run diverged");
    assert_eq!(one.samples, 300);
    assert_eq!(
        one.wins_a + one.wins_b,
        300,
        "every match is decisive (no draws)"
    );
}

#[test]
fn sweep_is_thread_count_independent() {
    let rs = seed_ruleset();
    let field = default_field();
    let a = run_sweep(
        &field,
        &rs,
        &SweepConfig {
            base_seed: 5,
            samples_per_matchup: 60,
            threads: Some(1),
            ..Default::default()
        },
    );
    let b = run_sweep(
        &field,
        &rs,
        &SweepConfig {
            base_seed: 5,
            samples_per_matchup: 60,
            threads: Some(8),
            ..Default::default()
        },
    );

    assert_eq!(a.candidates.len(), b.candidates.len());
    for (ca, cb) in a.candidates.iter().zip(&b.candidates) {
        assert_eq!(ca.label, cb.label);
        assert_eq!(
            ca.wins, cb.wins,
            "{}: sweep win count depends on thread count",
            ca.label
        );
        assert_eq!(ca.samples, cb.samples);
        assert_eq!(ca.clean_sweep, cb.clean_sweep);
    }
}
