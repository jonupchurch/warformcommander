//! Warform Commander — Monte-Carlo auto-balancer CLI (Feature 2, T002/T012/T024/T029).
//!
//! An **offline dev tool** (FR-022): `matchup | sweep | verify` over the **one** Feature 1 engine,
//! natively. It reads a `Ruleset` **read-only** (never mutates it — advisory only, FR-018/SC-006)
//! and emits a provenance-stamped [`BalanceReport`] as canonical JSON + human-readable markdown to
//! `--out` (default `balance-reports/`). All the logic lives in the `balancer` library; this is the
//! thin CLI shell.
//!
//! Run: `cargo run -p balancer --release -- verify` (or `matchup` / `sweep`).

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use clap::{Parser, Subcommand};

use balancer::archetypes::{default_field, energy_mechs, kinetic_tanks};
use balancer::batch::{BatchConfig, MatchupSpec};
use balancer::report::json::to_json;
use balancer::report::markdown::to_markdown;
use balancer::report::model::{BalanceReport, FairBand};
use balancer::run::{matchup_report, sweep_report, verify_report};
use balancer::sweep::SweepConfig;

use engine::content::seed_ruleset;
use engine::model::army::Army;
use engine::model::ruleset::Ruleset;

/// The Monte-Carlo auto-balancer — reproducible win-probability estimates, dominant/degenerate combo
/// flagging, and numeric verification of the four balance invariants. Advisory reports only.
#[derive(Parser, Debug)]
#[command(name = "balancer", version, about)]
struct Cli {
    #[command(subcommand)]
    command: Command,

    /// Base seed the whole run is reproducible from (FR-002).
    #[arg(long, global = true, default_value_t = 1)]
    seed: u64,

    /// Samples (Bo3 resolutions) per matchup — ~1500-2000 hits a ≤±2.5% Wilson half-width (research B1).
    #[arg(long, global = true, default_value_t = 2000)]
    samples: u32,

    /// rayon worker count; must not change results (SC-001). Omit for the global pool.
    #[arg(long, global = true)]
    threads: Option<u32>,

    /// Path to a Ruleset JSON to evaluate (read-only). Omit to use the engine's canonical seed table.
    #[arg(long, global = true)]
    ruleset: Option<PathBuf>,

    /// Output directory for the emitted JSON + markdown reports.
    #[arg(long, global = true, default_value = "balance-reports")]
    out: PathBuf,

    /// Fair-band floor (a flag's interval must clear it).
    #[arg(long, global = true, default_value_t = 0.40)]
    floor: f64,

    /// Fair-band ceiling.
    #[arg(long, global = true, default_value_t = 0.60)]
    ceiling: f64,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Estimate one matchup's win probability (US1). Uses two army JSON files, or a built-in sample.
    Matchup {
        /// Side A (attacker) army JSON. Omit for a built-in sample matchup.
        #[arg(long)]
        army_a: Option<PathBuf>,
        /// Side B (defender) army JSON.
        #[arg(long)]
        army_b: Option<PathBuf>,
    },
    /// Sweep the reference field and flag dominant/degenerate/underpowered combos (US2).
    Sweep,
    /// Verify the four balance invariants + sweep + flags (US2 + US3).
    Verify,
}

fn main() {
    let cli = Cli::parse();
    let ruleset = load_ruleset(cli.ruleset.as_deref());
    let fair_band = FairBand {
        floor: cli.floor,
        ceiling: cli.ceiling,
    };

    let mut report = match &cli.command {
        Command::Matchup { army_a, army_b } => {
            let (a, b) = load_matchup(army_a.as_deref(), army_b.as_deref(), &ruleset);
            let cfg = BatchConfig {
                base_seed: cli.seed,
                samples: cli.samples,
                threads: cli.threads,
            };
            let matchup = MatchupSpec::new(a, b, "matchup");
            matchup_report(&matchup, &ruleset, &cfg, fair_band)
        }
        Command::Sweep => {
            let cfg = sweep_cfg(&cli, fair_band);
            sweep_report(&default_field(), &ruleset, &cfg)
        }
        Command::Verify => {
            let cfg = sweep_cfg(&cli, fair_band);
            verify_report(&default_field(), &ruleset, &cfg)
        }
    };

    // Stamp the wall-clock time (provenance for humans; excluded from the SC-001 reproducibility diff).
    report.provenance.generated_at = Some(epoch_stamp());

    emit(&report, &cli.out);
}

/// Load the ruleset **read-only** (FR-018): a `--ruleset` JSON, else the engine's seed table.
fn load_ruleset(path: Option<&std::path::Path>) -> Ruleset {
    match path {
        Some(p) => {
            let bytes = std::fs::read(p)
                .unwrap_or_else(|e| panic!("cannot read ruleset {}: {e}", p.display()));
            serde_json::from_slice(&bytes)
                .unwrap_or_else(|e| panic!("invalid ruleset JSON {}: {e}", p.display()))
        }
        None => seed_ruleset(),
    }
}

/// The two armies for `matchup` mode: JSON files if given, else a built-in kinetic-vs-energy sample.
fn load_matchup(
    a: Option<&std::path::Path>,
    b: Option<&std::path::Path>,
    rs: &Ruleset,
) -> (Army, Army) {
    let load = |p: &std::path::Path| -> Army {
        let bytes =
            std::fs::read(p).unwrap_or_else(|e| panic!("cannot read army {}: {e}", p.display()));
        serde_json::from_slice(&bytes)
            .unwrap_or_else(|e| panic!("invalid army JSON {}: {e}", p.display()))
    };
    let side_a = a.map(load).unwrap_or_else(|| kinetic_tanks(rs));
    let side_b = b.map(load).unwrap_or_else(|| energy_mechs(rs));
    (side_a, side_b)
}

fn sweep_cfg(cli: &Cli, fair_band: FairBand) -> SweepConfig {
    SweepConfig {
        base_seed: cli.seed,
        samples_per_matchup: cli.samples,
        threads: cli.threads,
        fair_band,
    }
}

/// Whole seconds since the Unix epoch, as a provenance string (no external date crate needed).
fn epoch_stamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("unix:{secs}")
}

/// Write the JSON + markdown artifacts to `out/`, and print the markdown to stdout.
fn emit(report: &BalanceReport, out: &std::path::Path) {
    std::fs::create_dir_all(out).unwrap_or_else(|e| panic!("cannot create {}: {e}", out.display()));
    let json = to_json(report);
    let md = to_markdown(report);
    let json_path = out.join("balance-report.json");
    let md_path = out.join("balance-report.md");
    std::fs::write(&json_path, &json)
        .unwrap_or_else(|e| panic!("cannot write {}: {e}", json_path.display()));
    std::fs::write(&md_path, &md)
        .unwrap_or_else(|e| panic!("cannot write {}: {e}", md_path.display()));

    println!("{md}");
    eprintln!("→ wrote {} and {}", json_path.display(), md_path.display());
}
