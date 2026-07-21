//! The combinatorial sweep (T017, research A2) — evaluate each candidate combo against a bounded
//! **reference field** and read its across-field win rate with a Wilson interval.
//!
//! v1 varies the **archetype** axis (the counter-web-spanning candidate pool in
//! [`crate::archetypes`]) — a bounded set, not the full type×variant×loadout×dials×positioning
//! space; the report's [`Coverage`] states exactly what was covered (FR-006). Each candidate is
//! evaluated **in both roles** against every other (attacker *and* defender), which cancels the
//! engine's deterministic first-strike side bias so the across-field number is fair. Illegal
//! candidates are skipped, never crashed (FR-005).

use engine::model::army::Army;
use engine::model::ruleset::Ruleset;
use engine::validate::validate;

use crate::archetypes::Archetype;
use crate::batch::{run_batch, BatchConfig, MatchupSpec, WinRateEstimate};
use crate::report::model::{Coverage, FairBand, MatchupResult};
use crate::stats::{wilson, Interval};

/// How to run a sweep (data-model SweepConfig — bounded, authored).
#[derive(Clone, Copy, Debug)]
pub struct SweepConfig {
    pub base_seed: u64,
    pub samples_per_matchup: u32,
    pub threads: Option<u32>,
    pub fair_band: FairBand,
}

impl Default for SweepConfig {
    fn default() -> Self {
        SweepConfig {
            base_seed: 1,
            samples_per_matchup: 400,
            threads: None,
            fair_band: FairBand::default(),
        }
    }
}

/// One candidate's across-field result (data-model FlaggedCombo source, pre-classification).
#[derive(Clone, Debug)]
pub struct CandidateResult {
    pub label: String,
    pub army: Army,
    /// Aggregate win rate across the whole field (both roles), integer-sourced.
    pub across_field_win_rate: f64,
    pub ci95: Interval,
    pub wins: u32,
    pub samples: u32,
    /// Won **every** field opponent (combined both roles > 50%) — the "no counterplay" signal
    /// (FR-014 at combo granularity, research C1).
    pub clean_sweep: bool,
}

/// The sweep's output — every candidate's across-field standing, the raw pairwise matchup
/// estimates (the report's `matchups` section), and honest coverage.
#[derive(Clone, Debug)]
pub struct SweepResult {
    pub candidates: Vec<CandidateResult>,
    pub matchups: Vec<MatchupResult>,
    pub coverage: Coverage,
}

/// Run the sweep: every legal ordered pair once (i as attacker vs j as defender), then aggregate
/// each candidate over both roles. The engine call inside each batch is already parallel across
/// matches; the outer pairing is sequential (deterministic, and the batches carry the parallelism).
pub fn run_sweep(field: &[Archetype], ruleset: &Ruleset, cfg: &SweepConfig) -> SweepResult {
    let batch_cfg = BatchConfig {
        base_seed: cfg.base_seed,
        samples: cfg.samples_per_matchup,
        threads: cfg.threads,
    };

    // Build + gate each candidate army once (FR-005): illegal builds are skipped, counted.
    let built: Vec<(usize, &Archetype, Army)> = field
        .iter()
        .enumerate()
        .map(|(i, a)| (i, a, (a.build)(ruleset)))
        .collect();
    let valid: Vec<&(usize, &Archetype, Army)> = built
        .iter()
        .filter(|(_, _, army)| validate(army, ruleset).is_ok())
        .collect();
    let skipped_invalid = (built.len() - valid.len()) as u32;
    let n = valid.len();

    // pair[a][d] = the estimate of valid[a] (attacker) vs valid[d] (defender); None on the diagonal.
    let mut pair: Vec<Vec<Option<WinRateEstimate>>> = vec![vec![None; n]; n];
    let mut matchups: Vec<MatchupResult> = Vec::with_capacity(n * n.saturating_sub(1));
    for a in 0..n {
        for d in 0..n {
            if a == d {
                continue;
            }
            // Distinct per-pair base seed so no two matchups share a seed stream (still reproducible).
            let seed = cfg.base_seed ^ ((a as u64) << 32) ^ (d as u64).wrapping_mul(0x9E37_79B9);
            let label = format!("{} vs {}", valid[a].1.label, valid[d].1.label);
            let m = MatchupSpec::new(valid[a].2.clone(), valid[d].2.clone(), label.clone());
            let est = run_batch(
                &m,
                ruleset,
                &BatchConfig {
                    base_seed: seed,
                    ..batch_cfg
                },
            );
            matchups.push(MatchupResult {
                label,
                estimate: est,
            });
            pair[a][d] = Some(est);
        }
    }

    // Aggregate each candidate across the field, over BOTH roles (cancels the side bias).
    let mut candidates = Vec::with_capacity(n);
    for i in 0..n {
        let mut wins = 0u32;
        let mut samples = 0u32;
        let mut clean_sweep = n > 1;
        // Needs both `pair[i][k]` and `pair[k][i]`, so an index loop (not an iterator) is correct.
        #[allow(clippy::needless_range_loop)]
        for k in 0..n {
            if i == k {
                continue;
            }
            // i as attacker vs k, and i as defender when k attacks.
            let as_atk = pair[i][k].as_ref().unwrap();
            let as_def = pair[k][i].as_ref().unwrap();
            let vs_wins = as_atk.wins_a + as_def.wins_b;
            let vs_samples = as_atk.samples + as_def.samples;
            wins += vs_wins;
            samples += vs_samples;
            // "Wins this opponent" = combined win rate over both roles > 50%.
            if vs_samples == 0 || (vs_wins as f64) <= (vs_samples as f64) * 0.5 {
                clean_sweep = false;
            }
        }
        let rate = if samples == 0 {
            0.0
        } else {
            wins as f64 / samples as f64
        };
        candidates.push(CandidateResult {
            label: valid[i].1.label.to_string(),
            army: valid[i].2.clone(),
            across_field_win_rate: crate::stats::round4(rate),
            ci95: wilson(wins, samples),
            wins,
            samples,
            clean_sweep,
        });
    }

    let pairs = (n * n.saturating_sub(1)) as u64;
    let coverage = Coverage {
        candidates_evaluated: n as u32,
        candidate_space_estimated: field.len() as u32,
        field_size: n as u32,
        samples_per_matchup: cfg.samples_per_matchup,
        total_resolutions: pairs * cfg.samples_per_matchup as u64,
        skipped_invalid,
    };

    SweepResult {
        candidates,
        matchups,
        coverage,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::archetypes::default_field;
    use engine::content::seed_ruleset;

    /// The sweep evaluates every legal archetype and reports honest coverage.
    #[test]
    fn sweep_covers_the_field() {
        let rs = seed_ruleset();
        let field = default_field();
        let res = run_sweep(
            &field,
            &rs,
            &SweepConfig {
                samples_per_matchup: 60,
                ..Default::default()
            },
        );
        assert_eq!(res.candidates.len(), field.len());
        assert_eq!(res.coverage.skipped_invalid, 0);
        assert_eq!(res.coverage.field_size, field.len() as u32);
        // Every candidate got a real sample count and a rate in [0,1].
        for c in &res.candidates {
            assert!(c.samples > 0);
            assert!((0.0..=1.0).contains(&c.across_field_win_rate));
        }
    }

    /// FR-005: an illegal candidate is skipped (counted), never crashing the sweep.
    #[test]
    fn illegal_candidate_is_skipped_not_crashed() {
        let rs = seed_ruleset();
        fn broken(_rs: &Ruleset) -> Army {
            Army { machines: vec![] } // wrong squad size → validate() rejects
        }
        let mut field = default_field();
        field.push(Archetype {
            label: "broken",
            build: broken,
        });
        let res = run_sweep(
            &field,
            &rs,
            &SweepConfig {
                samples_per_matchup: 40,
                ..Default::default()
            },
        );
        assert_eq!(res.coverage.skipped_invalid, 1);
        assert_eq!(res.candidates.len(), field.len() - 1);
        assert!(!res.candidates.iter().any(|c| c.label == "broken"));
    }
}
