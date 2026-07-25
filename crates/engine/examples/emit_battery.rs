//! Emit the golden-battery inputs + their **native** `resolve_bytes` outputs to a directory, for
//! the native==wasm parity check (T017). A Node script (`scripts/wasm-parity.mjs`) feeds the same
//! inputs through the wasm build and asserts byte-identical outputs — the P6/SC-001 contract.
//!
//! `cargo run -p engine --example emit_battery -- <out-dir>`

use std::fs;
use std::path::PathBuf;

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::Army;
use engine::model::types::{MachineTypeId, ZoneId};
use engine::replay::{Adaptation, MatchConfig, Side};
use engine::{resolve_bytes, BattleInput};

/// Must match `tests/determinism.rs::fixed_battle_input` exactly — this is the same battery the
/// native golden manifest pins.
fn battery_input(seed: u64) -> BattleInput {
    let rs = seed_ruleset();
    let army_a = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
            stock_instance(&rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 2),
            stock_instance(&rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 3),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 4),
        ],
    };
    let army_b = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::HeavyTank, "Cavalier", ZoneId::Front, 0),
            stock_instance(
                &rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                1,
            ),
            stock_instance(&rs, MachineTypeId::Mech, "Striker", ZoneId::Front, 2),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 3),
            stock_instance(&rs, MachineTypeId::Commander, "CommandPost", ZoneId::Rear, 4),
        ],
    };
    BattleInput {
        armies: [army_a, army_b],
        ruleset: rs,
        seed,
        match_config: MatchConfig {
            adaptation: Adaptation::Locked,
            defender_side: Side::B,
            best_of: 3,
        },
    }
}

fn main() {
    let dir = PathBuf::from(
        std::env::args()
            .nth(1)
            .expect("usage: emit_battery <out-dir>"),
    );
    fs::create_dir_all(&dir).expect("create out dir");

    for seed in [1u64, 42, 0xDEAD_BEEF, 0x1234_5678] {
        let input = battery_input(seed);
        let in_bytes = serde_json::to_vec(&input).expect("serialize input");
        let out_bytes = resolve_bytes(&in_bytes);
        fs::write(dir.join(format!("in_{seed:016x}.json")), &in_bytes).expect("write input");
        fs::write(dir.join(format!("native_{seed:016x}.json")), &out_bytes).expect("write output");
        println!(
            "seed {seed:016x}: input {} bytes, native output {} bytes",
            in_bytes.len(),
            out_bytes.len()
        );
    }
    println!("wrote battery to {}", dir.display());
}
