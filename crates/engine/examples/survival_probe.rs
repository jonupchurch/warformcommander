//! **SC-008 measurement probe** (spec 013, task T006) — how long do the fragile back-rank chassis
//! survive under a fixed threat?
//!
//! The aggregate balance report gives win rates, not per-chassis survival, so this fills the gap.
//! One fixed attacker army faces one fixed defender army holding exactly one Helicopter, one
//! Artillery, and one Rocket-Artillery in their home zones. Averaged over many seeds, the tick each
//! one dies on is a stable number that can be compared **before and after** the v2 defense rebuild.
//!
//! SC-008 requires these chassis to survive **no longer** after the rebuild than before, even on
//! their best defensive option — the defense pass must redistribute survivability, not inflate it.
//!
//! Run: `cargo run -q -p engine --example survival_probe --release`

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::Army;
use engine::model::ruleset::Ruleset;
use engine::model::types::{MachineTypeId, ZoneId};
use engine::replay::{Adaptation, Fate, MatchConfig, Side};
use engine::{resolve, BattleInput};

const SEEDS: u64 = 400;

/// The chassis under measurement, in the defender's slot order.
const PROBES: [(&str, MachineTypeId, &str); 3] = [
    ("Helicopter", MachineTypeId::AttackHeli, "Gunship"),
    ("Artillery", MachineTypeId::Artillery, "Longbow"),
    ("RocketArtillery", MachineTypeId::RocketArtillery, "Sentry"),
];

/// Defender: one of each fragile chassis in its home zone, screened by two heavy tanks.
fn defender(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            stock_instance(rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 0),
            stock_instance(rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 1),
            stock_instance(
                rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                2,
            ),
            stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 3),
            stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 4),
        ],
    }
}

/// Attacker: able to reach every zone — a SAM for the air, tanks for the line, artillery for depth.
/// Held fixed so the only thing that changes between runs is the defenders' own durability.
fn attacker(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            stock_instance(
                rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                0,
            ),
            stock_instance(rs, MachineTypeId::HeavyTank, "Cavalier", ZoneId::Front, 1),
            stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
            stock_instance(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 3),
            stock_instance(rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 4),
        ],
    }
}

fn main() {
    let ruleset = seed_ruleset();

    // Per probe slot: death ticks observed, and how many runs it survived outright.
    let mut deaths: [Vec<u32>; 3] = [Vec::new(), Vec::new(), Vec::new()];
    let mut survived = [0u32; 3];
    let mut ruleset_hash = String::new();

    for seed in 0..SEEDS {
        let input = BattleInput {
            armies: [attacker(&ruleset), defender(&ruleset)],
            ruleset: ruleset.clone(),
            seed,
            match_config: MatchConfig {
                adaptation: Adaptation::Locked,
                defender_side: Side::B,
                best_of: 1,
            },
        };
        let out = resolve(&input).expect("probe armies are valid");
        if ruleset_hash.is_empty() {
            ruleset_hash = out.replay.ruleset_hash.0.clone();
        }

        for (slot, _) in PROBES.iter().enumerate() {
            let fate = out
                .result
                .machine_fates
                .iter()
                .find(|f| f.unit.side == Side::B && f.unit.instance_id == slot as u8);
            match fate.map(|f| f.fate) {
                Some(Fate::DestroyedAtTick(t)) => deaths[slot].push(t as u32),
                _ => survived[slot] += 1,
            }
        }
    }

    println!("Warform Commander — squishy-chassis survival probe (SC-008 baseline)");
    println!("  ruleset hash : {ruleset_hash}");
    println!("  seeds        : {SEEDS}");
    println!();
    println!(
        "  {:<26} {:>10} {:>10} {:>10} {:>9}",
        "chassis", "mean tick", "median", "min", "survived"
    );
    println!("  {:-<68}", "");

    for (slot, (name, _, variant)) in PROBES.iter().enumerate() {
        let mut d = deaths[slot].clone();
        d.sort_unstable();
        let (mean, median, min) = if d.is_empty() {
            (0.0, 0, 0)
        } else {
            let sum: u32 = d.iter().sum();
            (sum as f64 / d.len() as f64, d[d.len() / 2], d[0])
        };
        println!(
            "  {:<26} {:>10.1} {:>10} {:>10} {:>8}%",
            format!("{name} ({variant})"),
            mean,
            median,
            min,
            survived[slot] * 100 / SEEDS as u32
        );
    }
}
