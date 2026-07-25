//! Per-unit-type effectiveness pass (throwaway analysis). Runs the balancer's reference-field
//! round-robin and, instead of only per-archetype win rates, walks every game's replay events to
//! pool **per-machine-type** combat metrics — offensive output, kills, durability, and (for support)
//! healing — so we can ask "is any one unit *type* over/under-powered?" beyond the squad level.
//!
//! `cargo run -p balancer --release --example unit_effectiveness -- <ruleset.json> [samples] [seed]`

use std::collections::BTreeMap;
use std::fs;

use balancer::archetypes::default_field;
use engine::model::army::Army;
use engine::model::ruleset::Ruleset;
use engine::model::types::MachineTypeId;
use engine::replay::{Adaptation, MatchConfig, Side, TickEvent, UnitRef};
use engine::{resolve, BattleInput};

#[derive(Default, Clone)]
struct Stat {
    unit_games: u64, // (unit, game) observations of this type
    dmg: i128,       // milli, dealt
    dmg_taken: i128, // milli, received
    heal: i128,      // milli, healing dealt (support)
    kills: u64,
    survived: u64, // games this unit ended alive
    wins: u64,     // games this unit's side won
}

fn type_name(t: MachineTypeId) -> &'static str {
    match t {
        MachineTypeId::HeavyTank => "HeavyTank",
        MachineTypeId::LightTank => "LightTank",
        MachineTypeId::Mech => "Mech",
        MachineTypeId::AttackHeli => "AttackHeli",
        MachineTypeId::RocketArtillery => "RocketArty",
        MachineTypeId::Artillery => "Artillery",
        MachineTypeId::Commander => "Commander",
    }
}

/// (side, instance_id) -> machine type, for attributing replay events back to a unit's class.
fn type_map(army: &Army, side: Side, out: &mut BTreeMap<(Side, u8), MachineTypeId>) {
    for m in &army.machines {
        out.insert((side, m.instance_id), m.type_id);
    }
}

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args
        .next()
        .expect("usage: unit_effectiveness <ruleset.json> [samples] [seed]");
    let samples: u64 = args.next().and_then(|s| s.parse().ok()).unwrap_or(100);
    let base_seed: u64 = args.next().and_then(|s| s.parse().ok()).unwrap_or(1);

    let bytes = fs::read(&path).unwrap_or_else(|e| panic!("read {path}: {e}"));
    let ruleset: Ruleset = serde_json::from_slice(&bytes).expect("valid ruleset JSON");

    let field = default_field();
    let cfg = MatchConfig {
        adaptation: Adaptation::Locked,
        defender_side: Side::B,
        best_of: 3,
    };

    let mut agg: BTreeMap<MachineTypeId, Stat> = BTreeMap::new();
    let mut battles: u64 = 0;
    let mut counter: u64 = 0;

    for (i, a_arch) in field.iter().enumerate() {
        for (j, b_arch) in field.iter().enumerate() {
            if i == j {
                continue; // no mirror matches
            }
            let army_a = (a_arch.build)(&ruleset);
            let army_b = (b_arch.build)(&ruleset);
            let mut types: BTreeMap<(Side, u8), MachineTypeId> = BTreeMap::new();
            type_map(&army_a, Side::A, &mut types);
            type_map(&army_b, Side::B, &mut types);

            for _ in 0..samples {
                let seed = base_seed
                    .wrapping_add(counter)
                    .wrapping_mul(0x9E37_79B9_7F4A_7C15);
                counter += 1;
                let out = resolve(&BattleInput {
                    armies: [army_a.clone(), army_b.clone()],
                    ruleset: ruleset.clone(),
                    seed,
                    match_config: cfg,
                })
                .expect("archetypes are legal");
                battles += 1;

                for game in &out.replay.games {
                    let winner = game.game_result.winner;
                    // Per-game accumulation, attributed by unit type.
                    let mut dmg: BTreeMap<UnitRef, i128> = BTreeMap::new();
                    let mut taken: BTreeMap<UnitRef, i128> = BTreeMap::new();
                    let mut heal: BTreeMap<UnitRef, i128> = BTreeMap::new();
                    let mut kills: BTreeMap<UnitRef, u64> = BTreeMap::new();
                    let mut died: BTreeMap<UnitRef, bool> = BTreeMap::new();
                    for tick in &game.ticks {
                        for ev in &tick.events {
                            match ev {
                                TickEvent::Hit {
                                    actor,
                                    target,
                                    dmg: d,
                                    ..
                                } => {
                                    *dmg.entry(*actor).or_default() += d.milli() as i128;
                                    *taken.entry(*target).or_default() += d.milli() as i128;
                                }
                                TickEvent::Death { unit, killer } => {
                                    died.insert(*unit, true);
                                    if let Some(k) = killer {
                                        *kills.entry(*k).or_default() += 1;
                                    }
                                }
                                TickEvent::Support { actor, amount, .. } => {
                                    *heal.entry(*actor).or_default() += amount.milli() as i128;
                                }
                                _ => {}
                            }
                        }
                    }
                    // Fold each of the 10 units in this game into its type bucket.
                    for (&(side, iid), &ty) in &types {
                        let u = UnitRef {
                            side,
                            instance_id: iid,
                        };
                        let s = agg.entry(ty).or_default();
                        s.unit_games += 1;
                        s.dmg += dmg.get(&u).copied().unwrap_or(0);
                        s.dmg_taken += taken.get(&u).copied().unwrap_or(0);
                        s.heal += heal.get(&u).copied().unwrap_or(0);
                        s.kills += kills.get(&u).copied().unwrap_or(0);
                        if !died.get(&u).copied().unwrap_or(false) {
                            s.survived += 1;
                        }
                        if winner == Some(side) {
                            s.wins += 1;
                        }
                    }
                }
            }
        }
    }

    // --- Report ---
    println!("# Per-unit-type effectiveness (v5 ruleset)\n");
    println!("- Battles (Bo3 matches): {battles}");
    println!("- Field: {} archetypes, full round-robin\n", field.len());
    println!("| Type | unit-games | dmg/game | kills/game | survive% | dmg taken/game | heal/game | side win% |");
    println!("|---|---:|---:|---:|---:|---:|---:|---:|");

    // Sort by damage dealt per game (offensive output), descending.
    let mut rows: Vec<(MachineTypeId, Stat)> = agg.into_iter().collect();
    rows.sort_by(|a, b| {
        let da = a.1.dmg as f64 / a.1.unit_games.max(1) as f64;
        let db = b.1.dmg as f64 / b.1.unit_games.max(1) as f64;
        db.partial_cmp(&da).unwrap_or(std::cmp::Ordering::Equal)
    });
    for (ty, s) in rows {
        let ug = s.unit_games.max(1) as f64;
        let dmg = s.dmg as f64 / ug / 1000.0;
        let kills = s.kills as f64 / ug;
        let surv = 100.0 * s.survived as f64 / ug;
        let taken = s.dmg_taken as f64 / ug / 1000.0;
        let heal = s.heal as f64 / ug / 1000.0;
        let win = 100.0 * s.wins as f64 / ug;
        println!(
            "| {} | {} | {:.0} | {:.2} | {:.1} | {:.0} | {:.0} | {:.1} |",
            type_name(ty),
            s.unit_games,
            dmg,
            kills,
            surv,
            taken,
            heal,
            win,
        );
    }
}
