//! Golden-path runner (quickstart): build two stock 5v5 armies from the seed ruleset, resolve a
//! battle, and print the outcome + the replay's content digest. `cargo run -p engine --example
//! resolve_demo`. The digest matching across runs/targets is the determinism contract (SC-001).

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::Army;
use engine::model::types::{MachineTypeId, ZoneId};
use engine::replay::{Adaptation, MatchConfig, Side};
use engine::{resolve, BattleInput};

fn main() {
    let ruleset = seed_ruleset();

    let army_a = Army {
        machines: vec![
            stock_instance(
                &ruleset,
                MachineTypeId::HeavyTank,
                "Grizzly",
                ZoneId::Front,
                0,
            ),
            stock_instance(
                &ruleset,
                MachineTypeId::LightTank,
                "Scout",
                ZoneId::Front,
                1,
            ),
            stock_instance(&ruleset, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 2),
            stock_instance(
                &ruleset,
                MachineTypeId::AttackHeli,
                "Gunship",
                ZoneId::Air,
                3,
            ),
            stock_instance(
                &ruleset,
                MachineTypeId::Artillery,
                "Longbow",
                ZoneId::Rear,
                4,
            ),
        ],
    };
    let army_b = Army {
        machines: vec![
            stock_instance(
                &ruleset,
                MachineTypeId::HeavyTank,
                "Cavalier",
                ZoneId::Front,
                0,
            ),
            stock_instance(
                &ruleset,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                1,
            ),
            stock_instance(&ruleset, MachineTypeId::Mech, "Striker", ZoneId::Front, 2),
            stock_instance(
                &ruleset,
                MachineTypeId::Artillery,
                "Longbow",
                ZoneId::Rear,
                3,
            ),
            stock_instance(
                &ruleset,
                MachineTypeId::Commander,
                "CommandPost",
                ZoneId::Rear,
                4,
            ),
        ],
    };

    let input = BattleInput {
        armies: [army_a, army_b],
        ruleset,
        seed: 0xC0FFEE,
        match_config: MatchConfig {
            adaptation: Adaptation::Locked,
            defender_side: Side::B,
            best_of: 3,
        },
    };

    let out = resolve(&input).expect("stock armies are valid");
    let game = &out.replay.games[0];

    println!("Warform Commander — resolve_demo");
    println!("  seed          : {:#x}", input.seed);
    println!("  ruleset hash  : {}", out.replay.ruleset_hash.0);
    println!("  winner        : {:?}", out.result.winner);
    println!(
        "  win condition : {:?} ({:?})",
        game.game_result.condition, game.game_result.reward_tier
    );
    println!(
        "  duration      : {} ticks",
        game.game_result.duration_ticks
    );
    println!(
        "  survivors     : A={} B={}",
        out.result.side_a.survivors, out.result.side_b.survivors
    );
    println!(
        "  damage dealt  : A={} B={}",
        out.result.side_a.damage_dealt.to_int(),
        out.result.side_b.damage_dealt.to_int()
    );
    println!("  replay digest : {}", out.replay.digest());
}
