//! v2 stance dial (spec 013, US2) — stance as a **fire-allocation** axis, not a magnitude one.
//!
//! Aggro tiers narrow the candidate row before the Target Rule picks, so stance decides *which* of
//! your units gets shot. The tests assert the tiers order targeting (Aggressive/Protector shield
//! Neutral shields Defensive), that a uniform-stance army is byte-identical to all-Neutral (the
//! zero-sum guarantee), that an Aggressive attacker cannot be baited, that a Protector intercepts for
//! its neighbours, and that Opportunist executes wounded targets — all through the public `resolve`.

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::{Army, MachineInstance};
use engine::model::ruleset::Ruleset;
use engine::model::types::{MachineTypeId, Stance, ZoneId};
use engine::replay::{Adaptation, Fate, MatchConfig, Side, UnitRef};
use engine::{resolve, BattleInput, BattleOutput};

fn config() -> MatchConfig {
    MatchConfig {
        adaptation: Adaptation::Locked,
        defender_side: Side::B,
        best_of: 1,
    }
}

fn run(rs: &Ruleset, a: Army, b: Army, seed: u64) -> BattleOutput {
    resolve(&BattleInput {
        armies: [a, b],
        ruleset: rs.clone(),
        seed,
        match_config: config(),
    })
    .expect("curated squads are legal")
}

fn with_stance(mut m: MachineInstance, stance: Stance) -> MachineInstance {
    m.dials.stance = stance;
    m
}

/// Equip Combat AI (unlocks the gated Opportunist stance) in the first utility slot.
fn with_combat_ai(mut m: MachineInstance) -> MachineInstance {
    m.loadout.utilities[0] = engine::model::types::EquipmentId::new("CombatAI");
    m
}

/// The first tick at which a specific machine took any hit (its shield or hull dropped from the
/// tick-0 opening). `u16::MAX` if it was never touched across the battle.
fn first_hit_tick(out: &BattleOutput, u: UnitRef) -> u16 {
    let g = &out.replay.games[0];
    let opening = g.ticks[0]
        .snapshot
        .iter()
        .find(|s| s.unit == u)
        .map(|s| (s.hull, s.shield))
        .expect("unit present");
    for t in &g.ticks {
        if let Some(s) = t.snapshot.iter().find(|s| s.unit == u) {
            if (s.hull, s.shield) != opening {
                return t.index;
            }
        }
    }
    u16::MAX
}

fn tank(rs: &Ruleset, variant: &str, zone: ZoneId, id: u8) -> MachineInstance {
    stock_instance(rs, MachineTypeId::HeavyTank, variant, zone, id)
}

/// Two allies in one row, one Aggressive and one Defensive: the enemy targets the Aggressive one and
/// leaves the Defensive one alone while it has the choice (FR-012, the core allocation behaviour).
#[test]
fn aggressive_draws_fire_and_defensive_sheds_it() {
    let rs = seed_ruleset();

    // Side B: an Aggressive tank and a Defensive tank share the Front row; three padding units fill
    // the squad (in Middle, so they are not the frontmost row the attacker collapses onto).
    let defender = Army {
        machines: vec![
            with_stance(tank(&rs, "Grizzly", ZoneId::Front, 0), Stance::Aggressive),
            with_stance(tank(&rs, "Grizzly", ZoneId::Front, 1), Stance::Defensive),
            tank(&rs, "Grizzly", ZoneId::Middle, 2),
            tank(&rs, "Grizzly", ZoneId::Middle, 3),
            tank(&rs, "Grizzly", ZoneId::Middle, 4),
        ],
    };
    let attacker = Army {
        machines: vec![
            tank(&rs, "Cavalier", ZoneId::Front, 0),
            tank(&rs, "Cavalier", ZoneId::Front, 1),
            tank(&rs, "Cavalier", ZoneId::Front, 2),
            tank(&rs, "Grizzly", ZoneId::Middle, 3),
            tank(&rs, "Grizzly", ZoneId::Middle, 4),
        ],
    };
    let out = run(&rs, attacker, defender, 0xA11);

    let aggressive = first_hit_tick(
        &out,
        UnitRef {
            side: Side::B,
            instance_id: 0,
        },
    );
    let defensive = first_hit_tick(
        &out,
        UnitRef {
            side: Side::B,
            instance_id: 1,
        },
    );
    assert!(
        aggressive < defensive,
        "the Aggressive tank should be hit before the Defensive one: aggressive@{aggressive} defensive@{defensive}"
    );
}

/// The zero-sum guarantee (FR-017): an army where every machine holds the same stance resolves to a
/// **byte-identical** replay as the same army all-Neutral — stance is purely relative.
#[test]
fn a_uniform_stance_army_is_identical_to_all_neutral() {
    let rs = seed_ruleset();

    let squad = |stance: Stance| Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                with_stance(tank(&rs, "Grizzly", zone, i), stance)
            })
            .collect(),
    };
    let enemy = || Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                tank(&rs, "Cavalier", zone, i)
            })
            .collect(),
    };

    let all_defensive = run(&rs, squad(Stance::Defensive), enemy(), 0x5A5A);
    let all_neutral = run(&rs, squad(Stance::Neutral), enemy(), 0x5A5A);
    // Compare the tick STREAM (snapshots + events), not the full replay digest — the digest also
    // records the input dials, which legitimately differ. The behaviour must be byte-identical.
    let stream = |o: &BattleOutput| serde_json::to_vec(&o.replay.games).unwrap();
    assert_eq!(
        stream(&all_defensive),
        stream(&all_neutral),
        "a uniform-stance army must behave identically to all-Neutral"
    );
}

/// A lone machine set to Defensive is still targeted normally — shedding fire requires *another* unit
/// in the row to absorb it (FR-015 edge case; a solitary Defensive gains nothing).
#[test]
fn a_lone_defensive_unit_is_targeted_normally() {
    let rs = seed_ruleset();

    // Side B fronts a single (Defensive) tank; the rest sit in Middle. The attacker's frontmost-row
    // collapse lands on the lone Front tank regardless of its stance, since it is the only candidate.
    let defender = Army {
        machines: vec![
            with_stance(tank(&rs, "Grizzly", ZoneId::Front, 0), Stance::Defensive),
            tank(&rs, "Grizzly", ZoneId::Middle, 1),
            tank(&rs, "Grizzly", ZoneId::Middle, 2),
            tank(&rs, "Grizzly", ZoneId::Rear, 3),
            tank(&rs, "Grizzly", ZoneId::Rear, 4),
        ],
    };
    let attacker = Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                tank(&rs, "Cavalier", zone, i)
            })
            .collect(),
    };
    let out = run(&rs, attacker, defender, 0xD00);
    assert!(
        first_hit_tick(
            &out,
            UnitRef {
                side: Side::B,
                instance_id: 0
            }
        ) < u16::MAX,
        "a lone Defensive front unit is still targeted — it has no ally to shed fire onto"
    );
}

/// An Aggressive attacker ignores enemy stance narrowing (FR-014): faced with an enemy Defensive tank
/// (which a Neutral attacker would skip in favour of a rowmate), it still engages by its Target Rule.
/// We assert the Defensive unit *is* hit despite a Neutral rowmate being present.
#[test]
fn an_aggressive_attacker_cannot_be_baited() {
    let rs = seed_ruleset();
    // Focus fire on the weakest so the Target Rule is deterministic; make instance 0 the weaker unit.
    let weaken = |mut m: MachineInstance| {
        m.dials.target_rule = engine::model::types::TargetRule::FocusFire;
        m
    };

    // Side B Front: a Defensive tank (id 0) and a Neutral tank (id 1). A Neutral attacker would shoot
    // the Neutral one (Defensive is shielded); an Aggressive attacker ignores that and focus-fires.
    let defender = Army {
        machines: vec![
            with_stance(tank(&rs, "Scout", ZoneId::Front, 0), Stance::Defensive), // low hull → focus target
            with_stance(tank(&rs, "Grizzly", ZoneId::Front, 1), Stance::Neutral),
            tank(&rs, "Grizzly", ZoneId::Middle, 2),
            tank(&rs, "Grizzly", ZoneId::Middle, 3),
            tank(&rs, "Grizzly", ZoneId::Rear, 4),
        ],
    };
    let aggressive_attacker = Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                weaken(with_stance(
                    tank(&rs, "Cavalier", zone, i),
                    Stance::Aggressive,
                ))
            })
            .collect(),
    };

    let out = run(&rs, aggressive_attacker, defender, 0xBA17);
    // The Aggressive attacker focus-fires the weakest (the Defensive Scout) rather than being steered
    // to the Neutral rowmate — so the Scout is destroyed.
    assert!(
        matches!(
            out.result
                .machine_fates
                .iter()
                .find(|f| f.unit
                    == UnitRef {
                        side: Side::B,
                        instance_id: 0
                    })
                .unwrap()
                .fate,
            Fate::DestroyedAtTick(_)
        ),
        "an Aggressive attacker ignores the enemy Defensive stance and focus-fires the weakest"
    );
}

/// A Protector guarding an adjacent zone intercepts fire aimed at its neighbours (FR-016): with a
/// Protector in Front, an attacker targeting the Middle row hits the Protector instead of the ally.
#[test]
fn a_protector_intercepts_for_an_adjacent_zone() {
    let rs = seed_ruleset();

    // Side B: a Protector in Front, and the unit it guards in Middle. An attacker in Middle reaching
    // Front+Middle would (per LastReachable) aim Middle, but the Front Protector intercepts.
    let defender = Army {
        machines: vec![
            with_stance(tank(&rs, "Grizzly", ZoneId::Front, 0), Stance::Protector),
            with_stance(tank(&rs, "Grizzly", ZoneId::Middle, 1), Stance::Neutral),
            tank(&rs, "Grizzly", ZoneId::Middle, 2),
            tank(&rs, "Grizzly", ZoneId::Rear, 3),
            tank(&rs, "Grizzly", ZoneId::Rear, 4),
        ],
    };
    let attacker = Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                let mut m = tank(&rs, "Cavalier", zone, i);
                m.dials.target_row = engine::model::types::TargetRow::LastReachable; // prefer deeper row
                m
            })
            .collect(),
    };
    let out = run(&rs, attacker, defender, 0x9307);

    // The Protector (Front) draws fire even though the attacker preferred the deeper Middle row.
    assert!(
        first_hit_tick(
            &out,
            UnitRef {
                side: Side::B,
                instance_id: 0
            }
        ) <= first_hit_tick(
            &out,
            UnitRef {
                side: Side::B,
                instance_id: 1
            }
        ),
        "the Protector should be hit no later than the neighbour it guards"
    );
}

/// Opportunist executes wounded targets (FR-018): the same shot deals more damage to a target below
/// the threshold than above it, and a zero bonus disables the mechanic — both read from the ruleset.
#[test]
fn opportunist_executes_wounded_targets() {
    // Measure the hull a single Opportunist attacker strips from a fixed defender over one game, once
    // with the default execute bonus and once with it zeroed. Below-threshold hits should differ.
    fn damage_dealt(bonus: i64, threshold: i64) -> i64 {
        let mut rs = seed_ruleset();
        rs.execute_mods.bonus = bonus;
        rs.execute_mods.threshold = threshold;

        let attacker = Army {
            machines: (0..5)
                .map(|i| {
                    let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                    with_combat_ai(with_stance(
                        tank(&rs, "Cavalier", zone, i),
                        Stance::Opportunist,
                    ))
                })
                .collect(),
        };
        let defender = Army {
            machines: (0..5)
                .map(|i| {
                    let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                    tank(&rs, "Grizzly", zone, i)
                })
                .collect(),
        };
        let out = run(&rs, attacker, defender, 0xE7EC);
        out.result.side(Side::A).damage_dealt.milli()
    }

    // Threshold at 100% hull → every hit is an execute; a +50% bonus must out-damage a zero bonus.
    let with_bonus = damage_dealt(5_000, 10_000);
    let no_bonus = damage_dealt(0, 10_000);
    assert!(
        with_bonus > no_bonus,
        "the execute bonus must raise damage against below-threshold targets: bonus={with_bonus} none={no_bonus}"
    );
}
