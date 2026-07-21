//! Polish T030 — SC-005 throughput smoke: ≥10,000 Bo3 resolutions complete in **minutes, not
//! hours** natively (ties to Feature 1 SC-006), and the aggregate is thread-count-independent.
//!
//! `#[ignore]` by default so the normal `cargo test` / CI stays fast; run it explicitly in release
//! for the real timing signal:
//!
//! ```text
//! cargo test -p balancer --release --test throughput -- --ignored --nocapture
//! ```

use std::time::Instant;

use balancer::archetypes::{energy_mechs, kinetic_tanks};
use balancer::batch::{run_batch, BatchConfig, MatchupSpec};
use engine::content::seed_ruleset;

#[test]
#[ignore = "throughput smoke — run explicitly in release (SC-005)"]
fn ten_thousand_bo3_complete_quickly_and_reproducibly() {
    let rs = seed_ruleset();
    let m = MatchupSpec::new(kinetic_tanks(&rs), energy_mechs(&rs), "throughput");
    const N: u32 = 10_000;

    let start = Instant::now();
    let single = run_batch(
        &m,
        &rs,
        &BatchConfig {
            base_seed: 1,
            samples: N,
            threads: Some(1),
        },
    );
    let single_elapsed = start.elapsed();

    let start = Instant::now();
    let parallel = run_batch(
        &m,
        &rs,
        &BatchConfig {
            base_seed: 1,
            samples: N,
            threads: None,
        },
    );
    let parallel_elapsed = start.elapsed();

    eprintln!(
        "10,000 Bo3 — single-thread {single_elapsed:.2?}, all-cores {parallel_elapsed:.2?} ({:.0} Bo3/s parallel)",
        N as f64 / parallel_elapsed.as_secs_f64()
    );

    assert_eq!(single.samples, N);
    // Thread count changes wall-clock, never the numbers (SC-001).
    assert_eq!(
        single, parallel,
        "the aggregate must be identical regardless of thread count"
    );
    // "Minutes, not hours" — a generous native ceiling that still catches a catastrophic regression.
    assert!(
        parallel_elapsed.as_secs() < 120,
        "10k Bo3 took {parallel_elapsed:.1?} (expected < 2 min)"
    );
}
