//! US4 (T042): the Locked vs Free adaptation policy (SC-007).
//!
//! - **Locked** (ranked): `resolve` uses the same army + placement for every game — so each game's
//!   opening state is provably identical.
//! - **Free** (practice / balancer): `resolve_series` runs each game from its own input — so a
//!   per-game change is honored (a different opening state).

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::Army;
use engine::model::ruleset::Ruleset;
use engine::model::types::{MachineTypeId, ZoneId};
use engine::replay::{Adaptation, MachineSnapshot, MatchConfig, Side};
use engine::{resolve, resolve_series, BattleInput};

fn base(rs: &Ruleset, adaptation: Adaptation) -> BattleInput {
    BattleInput {
        armies: [squad(rs, ZoneId::Front), squad(rs, ZoneId::Front)],
        ruleset: rs.clone(),
        seed: 0x0AD,
        match_config: MatchConfig {
            adaptation,
            defender_side: Side::B,
            best_of: 3,
        },
    }
}

/// A legal squad; `heavy_zone` places the lead heavy tank (used to vary placement between games).
fn squad(rs: &Ruleset, heavy_zone: ZoneId) -> Army {
    Army {
        machines: vec![
            stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", heavy_zone, 0),
            stock_instance(rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 1),
            stock_instance(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 2),
            stock_instance(rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 3),
            stock_instance(rs, MachineTypeId::Commander, "CommandPost", ZoneId::Rear, 4),
        ],
    }
}

/// The zone of each unit at game start — the placement fingerprint of a game.
fn opening_zones(snapshot: &[MachineSnapshot]) -> Vec<(Side, u8, engine::model::types::ZoneId)> {
    snapshot
        .iter()
        .map(|s| (s.unit.side, s.unit.instance_id, s.zone))
        .collect()
}

/// T042 Locked: army + placement are identical across all games of the match.
#[test]
fn locked_uses_identical_placement_each_game() {
    let rs = seed_ruleset();
    let out = resolve(&base(&rs, Adaptation::Locked)).unwrap();
    assert!(out.replay.games.len() >= 2, "a Bo3 plays ≥2 games");

    let first = opening_zones(&out.replay.games[0].ticks[0].snapshot);
    for game in &out.replay.games[1..] {
        assert_eq!(
            opening_zones(&game.ticks[0].snapshot),
            first,
            "Locked: every game opens from the identical placement"
        );
    }
}

/// T042 Free: a per-game placement change is honored — the second game opens differently.
#[test]
fn free_honors_per_game_changes() {
    let rs = seed_ruleset();
    let b = base(&rs, Adaptation::Free);

    // Game 1: the lead heavy in Front. Game 2: the same squad but the lead heavy repositioned to
    // Middle (a legal, distinct placement). Side B unchanged.
    let game1 = [squad(&rs, ZoneId::Front), squad(&rs, ZoneId::Front)];
    let game2 = [squad(&rs, ZoneId::Middle), squad(&rs, ZoneId::Front)];

    let out = resolve_series(&b, &[game1, game2]).unwrap();
    assert!(out.replay.games.len() >= 2, "a Bo3 plays ≥2 games");

    let open1 = opening_zones(&out.replay.games[0].ticks[0].snapshot);
    let open2 = opening_zones(&out.replay.games[1].ticks[0].snapshot);
    assert_ne!(
        open1, open2,
        "Free: the per-game placement change is reflected in game 2"
    );
}
