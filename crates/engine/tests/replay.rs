//! US5 (T046/T047-parity): the wire replay reconstructs the engine's state exactly, and its damage
//! events reconcile with the result totals (SC-002). This is the Rust twin of the TS reader's
//! contract (sim/replay-reader.ts) — both parse the same bytes and index the same rows.

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::Army;
use engine::model::types::{MachineTypeId, ZoneId};
use engine::replay::format::{is_supported, to_wire, zone_index, WireEvent, WireReplay};
use engine::replay::Side;
use engine::{resolve, BattleInput};
use engine::replay::{Adaptation, MatchConfig};

fn battle() -> BattleInput {
    let rs = seed_ruleset();
    let a = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
            stock_instance(&rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 2),
            stock_instance(&rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 3),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 4),
        ],
    };
    let b = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::HeavyTank, "Cavalier", ZoneId::Front, 0),
            stock_instance(&rs, MachineTypeId::RocketArtillery, "Sentry", ZoneId::Middle, 1),
            stock_instance(&rs, MachineTypeId::Mech, "Striker", ZoneId::Front, 2),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 3),
            stock_instance(&rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 4),
        ],
    };
    BattleInput {
        armies: [a, b],
        ruleset: rs,
        seed: 0x5EED_1234_ABCD,
        match_config: MatchConfig {
            adaptation: Adaptation::Locked,
            defender_side: Side::B,
            best_of: 3,
        },
    }
}

/// T046: reconstructing each unit's hull/shield/zone/alive from the (JSON round-tripped) wire replay
/// equals the engine's computed state at every tick.
#[test]
fn wire_snapshots_reconstruct_engine_state() {
    let input = battle();
    let out = resolve(&input).unwrap();

    // Round-trip through JSON exactly as the client would.
    let wire = to_wire(&out.replay, &input.ruleset);
    let json = serde_json::to_string(&wire).unwrap();
    let wire: WireReplay = serde_json::from_str(&json).unwrap();

    assert_eq!(wire.games.len(), out.replay.games.len());
    for (g, game) in out.replay.games.iter().enumerate() {
        let wgame = &wire.games[g];
        assert_eq!(wgame.snapshots.len(), game.ticks.len());
        for (t, tick) in game.ticks.iter().enumerate() {
            for snap in &tick.snapshot {
                // The unit's column in the dictionary.
                let col = wire
                    .meta
                    .unit_order
                    .iter()
                    .position(|u| u.side == snap.unit.side && u.instance_id == snap.unit.instance_id)
                    .expect("unit in dictionary");
                let row = wgame.row(t, col).expect("row present"); // O(1) seek
                assert_eq!(row[0], snap.hull.milli(), "hull at g{g} t{t} col{col}");
                assert_eq!(row[1], snap.shield.milli(), "shield at g{g} t{t} col{col}");
                assert_eq!(row[2], zone_index(snap.zone) as i64, "zone at g{g} t{t} col{col}");
                assert_eq!(row[3], snap.alive as i64, "alive at g{g} t{t} col{col}");
            }
        }
    }
}

/// T046 (SC-002): summed Hit damage in the wire events equals the result's per-side totals.
#[test]
fn wire_events_reconcile_with_result_totals() {
    let input = battle();
    let out = resolve(&input).unwrap();
    let wire = to_wire(&out.replay, &input.ruleset);

    // Side A occupies columns 0..5 of the dictionary (5 machines, side A first).
    let a_cols: std::collections::BTreeSet<u8> = wire
        .meta
        .unit_order
        .iter()
        .enumerate()
        .filter(|(_, u)| u.side == Side::A)
        .map(|(i, _)| i as u8)
        .collect();

    let mut sum_a: i64 = 0;
    let mut sum_b: i64 = 0;
    for game in &wire.games {
        for tick in &game.events {
            for ev in tick {
                if let WireEvent::Hit { a, dmg, .. } = ev {
                    if a_cols.contains(a) {
                        sum_a += dmg;
                    } else {
                        sum_b += dmg;
                    }
                }
            }
        }
    }
    assert_eq!(sum_a, wire.result.side(Side::A).damage_dealt.milli());
    assert_eq!(sum_b, wire.result.side(Side::B).damage_dealt.milli());
}

/// T047-parity: the format-version gate accepts the current version and rejects the unknown.
#[test]
fn format_version_is_gated() {
    let input = battle();
    let out = resolve(&input).unwrap();
    let wire = to_wire(&out.replay, &input.ruleset);
    assert!(is_supported(wire.format_version), "the emitted version is supported");
    assert!(!is_supported(9999), "an unknown version is rejected");
}

/// The wire meta carries seed (as a JSON-safe string), rulesetHash, and the full unit dictionary.
#[test]
fn wire_meta_is_complete() {
    let input = battle();
    let out = resolve(&input).unwrap();
    let wire = to_wire(&out.replay, &input.ruleset);
    assert_eq!(wire.meta.seed, input.seed.to_string());
    assert_eq!(wire.meta.ruleset_hash, input.ruleset.hash());
    assert_eq!(wire.meta.unit_order.len(), 10, "all 10 units in the dictionary");
    assert_eq!(wire.meta.tick_cap, 1000);
}
