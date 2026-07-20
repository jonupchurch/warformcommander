//! Warform Commander — Monte-Carlo auto-balancer (Feature 2).
//!
//! Feature 1 reserves this crate and proves the **balancer hook** (FR-024, SC-006): the balancer
//! needs *only* the public `engine::resolve` — it runs a matchup over many seeds and reads win rates
//! from the returned `MatchResult`s, never a second engine (that would break P6/P4). The real
//! optimizer is built out in `specs/002-auto-balancer/`.
//!
//! Run: `cargo run -p balancer --release -- [matches]` (default 2000). Release does the SC-006
//! ≥10,000-Bo3 throughput target in well under a minute.

use std::time::Instant;

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::Army;
use engine::model::types::{MachineTypeId, ZoneId};
use engine::replay::{Adaptation, MatchConfig, Side};
use engine::{resolve, BattleInput};

fn main() {
    let matches: u64 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(2000);

    println!(
        "Warform Commander balancer — linked engine v{} — {matches} Bo3 matchups",
        engine::engine_version()
    );

    let ruleset = seed_ruleset();
    let (army_a, army_b) = sample_matchup(&ruleset);
    let config = MatchConfig {
        adaptation: Adaptation::Locked,
        defender_side: Side::B,
        best_of: 3,
    };

    let start = Instant::now();
    let mut a_wins: u64 = 0;
    for seed in 0..matches {
        let input = BattleInput {
            armies: [army_a.clone(), army_b.clone()],
            ruleset: ruleset.clone(),
            seed,
            match_config: config,
        };
        // The entire balancer surface: one call, read the winner. No balancing logic in the engine.
        let out = resolve(&input).expect("stock armies are legal");
        if out.result.winner == Side::A {
            a_wins += 1;
        }
    }
    let elapsed = start.elapsed();

    let rate = matches as f64 / elapsed.as_secs_f64();
    println!(
        "  A win rate : {a_wins}/{matches} = {:.1}%",
        100.0 * a_wins as f64 / matches as f64
    );
    println!("  elapsed    : {:.2?}", elapsed);
    println!("  throughput : {rate:.0} Bo3/sec");
    let projected_10k = 10_000.0 / rate;
    println!("  SC-006     : 10,000 Bo3 ≈ {projected_10k:.1}s (target: minutes)");
}

/// Two representative stock squads for the throughput smoke.
fn sample_matchup(ruleset: &engine::model::ruleset::Ruleset) -> (Army, Army) {
    let a = Army {
        machines: vec![
            stock_instance(
                ruleset,
                MachineTypeId::HeavyTank,
                "Grizzly",
                ZoneId::Front,
                0,
            ),
            stock_instance(ruleset, MachineTypeId::LightTank, "Scout", ZoneId::Front, 1),
            stock_instance(ruleset, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 2),
            stock_instance(
                ruleset,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                3,
            ),
            stock_instance(
                ruleset,
                MachineTypeId::Artillery,
                "Longbow",
                ZoneId::Rear,
                4,
            ),
        ],
    };
    let b = Army {
        machines: vec![
            stock_instance(
                ruleset,
                MachineTypeId::HeavyTank,
                "Cavalier",
                ZoneId::Front,
                0,
            ),
            stock_instance(ruleset, MachineTypeId::Mech, "Striker", ZoneId::Front, 1),
            stock_instance(
                ruleset,
                MachineTypeId::AttackHeli,
                "Gunship",
                ZoneId::Air,
                2,
            ),
            stock_instance(
                ruleset,
                MachineTypeId::RearSupport,
                "Medic",
                ZoneId::Middle,
                3,
            ),
            stock_instance(
                ruleset,
                MachineTypeId::Artillery,
                "Marksman",
                ZoneId::Rear,
                4,
            ),
        ],
    };
    (a, b)
}
