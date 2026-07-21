//! Report assembly (T029) — compose the batch / sweep / invariant results into a provenance-stamped
//! [`BalanceReport`] for each mode (`matchup` / `sweep` / `verify`). The ruleset is read-only
//! throughout; assembly never mutates it (FR-018, SC-006). `generatedAt` is left `None` here (the
//! deterministic body); the CLI stamps it at write time.

use engine::model::ruleset::Ruleset;
use engine::replay::CURRENT_FORMAT_VERSION;

use crate::archetypes::Archetype;
use crate::batch::{run_batch, BatchConfig, MatchupSpec};
use crate::flags::classify_all;
use crate::invariants::{verify_with_sweep, InvariantConfig};
use crate::report::model::{
    BalanceReport, Coverage, FairBand, MatchupResult, Provenance, RunConfig, REPORT_VERSION,
};
use crate::sweep::{run_sweep, SweepConfig};

/// The provenance stamp binding the report to the exact table + engine build it evaluated (SC-007).
pub fn provenance(ruleset: &Ruleset) -> Provenance {
    Provenance {
        ruleset_hash: ruleset.hash().0,
        engine_version: engine::engine_version().to_string(),
        replay_format_version: CURRENT_FORMAT_VERSION,
        generated_at: None,
    }
}

fn run_config(
    base_seed: u64,
    samples: u32,
    threads: Option<u32>,
    fair_band: FairBand,
) -> RunConfig {
    RunConfig {
        base_seed: base_seed.to_string(),
        samples_per_matchup: samples,
        threads,
        fair_band,
    }
}

/// US1 — a single matchup's estimate (no sweep/invariants).
pub fn matchup_report(
    matchup: &MatchupSpec,
    ruleset: &Ruleset,
    cfg: &BatchConfig,
    fair_band: FairBand,
) -> BalanceReport {
    let est = run_batch(matchup, ruleset, cfg);
    let label = matchup.label.clone().unwrap_or_else(|| "matchup".into());
    BalanceReport {
        report_version: REPORT_VERSION,
        provenance: provenance(ruleset),
        run_config: run_config(cfg.base_seed, cfg.samples, cfg.threads, fair_band),
        matchups: vec![MatchupResult {
            label,
            estimate: est,
        }],
        flagged: vec![],
        invariants: vec![],
        coverage: Coverage {
            candidates_evaluated: 2,
            candidate_space_estimated: 2,
            field_size: 1,
            samples_per_matchup: cfg.samples,
            total_resolutions: est.samples as u64,
            skipped_invalid: 0,
        },
    }
}

/// US2 — the sweep + severity-sorted flags (no invariants).
pub fn sweep_report(field: &[Archetype], ruleset: &Ruleset, cfg: &SweepConfig) -> BalanceReport {
    let sweep = run_sweep(field, ruleset, cfg);
    let flagged = classify_all(&sweep, &cfg.fair_band);
    BalanceReport {
        report_version: REPORT_VERSION,
        provenance: provenance(ruleset),
        run_config: run_config(
            cfg.base_seed,
            cfg.samples_per_matchup,
            cfg.threads,
            cfg.fair_band,
        ),
        matchups: sweep.matchups,
        flagged,
        invariants: vec![],
        coverage: sweep.coverage,
    }
}

/// US2 + US3 — the full pass: sweep + flags + the four invariant checks (the `verify` mode). One
/// sweep feeds both the flagged section and the no-dominant-unit invariant (no duplicated work).
pub fn verify_report(field: &[Archetype], ruleset: &Ruleset, cfg: &SweepConfig) -> BalanceReport {
    let sweep = run_sweep(field, ruleset, cfg);
    let flagged = classify_all(&sweep, &cfg.fair_band);
    let inv_cfg = InvariantConfig {
        base_seed: cfg.base_seed,
        samples: cfg.samples_per_matchup,
        threads: cfg.threads,
    };
    let invariants = verify_with_sweep(&sweep, ruleset, &inv_cfg);
    BalanceReport {
        report_version: REPORT_VERSION,
        provenance: provenance(ruleset),
        run_config: run_config(
            cfg.base_seed,
            cfg.samples_per_matchup,
            cfg.threads,
            cfg.fair_band,
        ),
        matchups: sweep.matchups,
        flagged,
        invariants,
        coverage: sweep.coverage,
    }
}
