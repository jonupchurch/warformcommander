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

fn light(rs: &Ruleset, variant: &str, zone: ZoneId, id: u8) -> MachineInstance {
    stock_instance(rs, MachineTypeId::LightTank, variant, zone, id)
}

fn medic(rs: &Ruleset, zone: ZoneId, id: u8) -> MachineInstance {
    stock_instance(rs, MachineTypeId::RearSupport, "Medic", zone, id)
}

fn warden(rs: &Ruleset, zone: ZoneId, id: u8) -> MachineInstance {
    stock_instance(rs, MachineTypeId::RearSupport, "Warden", zone, id)
}

/// Count `Heal` events to each side-A instance id across the battle.
fn heal_counts(out: &BattleOutput) -> std::collections::BTreeMap<u8, u32> {
    use engine::replay::{SupportKind, TickEvent};
    let mut counts = std::collections::BTreeMap::new();
    for t in &out.replay.games[0].ticks {
        for e in &t.events {
            if let TickEvent::Support {
                actor,
                target,
                kind: SupportKind::Heal,
                ..
            } = e
            {
                if actor.side == Side::A {
                    *counts.entry(target.instance_id).or_insert(0) += 1;
                }
            }
        }
    }
    counts
}

/// A ruleset whose three heavy variants are tuned to decouple hull from damage:
/// **Grizzly** = the potent fighter H (high damage, high hull, Sustain's pick); **Cavalier** = the
/// weakling L (low damage, lower hull, Triage's pick); **Bulwark** = the enemy's real gun.
fn tuned_patients_rs() -> Ruleset {
    use engine::fixed::Fixed;
    use engine::model::types::VariantId;
    let mut rs = seed_ruleset();
    let set = |rs: &mut Ruleset, name: &str, hull: i64, dmg: i64| {
        let v = rs.variants.get_mut(&VariantId::new(name)).unwrap();
        v.hull = Fixed::from_int(hull);
        v.damage = Fixed::from_int(dmg);
    };
    set(&mut rs, "Grizzly", 1479, 60); // H
    set(&mut rs, "Cavalier", 1000, 8); // L
    set(&mut rs, "Bulwark", 2000, 40); // enemy gun
    rs
}

fn patients_army(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            tank(rs, "Grizzly", ZoneId::Front, 0), // H — high damage, high hull
            tank(rs, "Cavalier", ZoneId::Front, 1), // L — low damage, lower hull
            light(rs, "Scout", ZoneId::Middle, 2),
            light(rs, "Scout", ZoneId::Middle, 3),
            medic(rs, ZoneId::Rear, 4),
        ],
    }
}

fn disperse_enemy(rs: &Ruleset) -> Army {
    use engine::model::types::TargetRule;
    Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                let mut m = tank(rs, "Bulwark", zone, i);
                // Concentrate on the weakling so L stays the most-damaged (lowest hull fraction), while
                // two chip the potent H so it is wounded too — giving Sustain a live high-value target.
                m.dials.target_rule = if i < 3 {
                    TargetRule::FocusFire
                } else {
                    TargetRule::DisperseFire
                };
                m
            })
            .collect(),
    }
}

/// Triage and Sustain service **different** allies from the same battle state (FR-020, US5 scenario
/// 1+2). The two heavy patients are tuned to break the roster's glass-cannon correlation: Grizzly
/// (id0) is the potent fighter (high damage), Cavalier (id1) the fragile weakling (low damage, lowest
/// hull fraction). Enemy fire keeps both wounded, so the medic always has a choice — and the choice
/// diverges: Sustain keeps the potent fighter topped up, Triage chases whoever is closest to death.
#[test]
fn triage_and_sustain_service_different_allies() {
    let rs = tuned_patients_rs();
    let heals = |st: Stance| {
        let mut a = patients_army(&rs);
        a.machines[4] = with_stance(a.machines[4].clone(), st);
        heal_counts(&run(&rs, a, disperse_enemy(&rs), 0x5011))
    };
    let triage = heals(Stance::Triage);
    let sustain = heals(Stance::Sustain);
    let get = |m: &std::collections::BTreeMap<u8, u32>, id: u8| *m.get(&id).unwrap_or(&0);

    assert!(
        get(&sustain, 0) > get(&triage, 0),
        "Sustain must service the high-value fighter (id0) more than Triage: sustain={sustain:?} triage={triage:?}"
    );
    assert!(
        get(&triage, 1) > get(&sustain, 1),
        "Triage must service the most-damaged weakling (id1) more than Sustain: triage={triage:?} sustain={sustain:?}"
    );
}

/// Empower forgoes repair entirely to strengthen allies (FR-021, scenario 3): the medic emits
/// shield-granting `Aura` events with a positive amount and **no** `Heal` events at all.
#[test]
fn empower_strengthens_without_repairing() {
    use engine::replay::{SupportKind, TickEvent};
    let rs = seed_ruleset();
    let mut a = patients_army(&rs);
    a.machines[4] = with_stance(a.machines[4].clone(), Stance::Empower);
    let medic_ref = UnitRef {
        side: Side::A,
        instance_id: 4,
    };
    let out = run(&rs, a, disperse_enemy(&rs), 0x5011);

    let mut auras = 0u32;
    let mut heals = 0u32;
    let mut positive_grant = false;
    for t in &out.replay.games[0].ticks {
        for e in &t.events {
            if let TickEvent::Support {
                actor,
                kind,
                amount,
                ..
            } = e
            {
                if *actor == medic_ref {
                    match kind {
                        SupportKind::Aura => {
                            auras += 1;
                            positive_grant |= amount.milli() > 0;
                        }
                        SupportKind::Heal => heals += 1,
                        _ => {}
                    }
                }
            }
        }
    }
    assert!(
        auras > 0 && positive_grant,
        "Empower must strengthen allies with positive Aura grants: auras={auras} positive={positive_grant}"
    );
    assert_eq!(
        heals, 0,
        "Empower forgoes repair — it must emit no Heal events"
    );
}

/// The stance dial is partitioned by role (FR-019): a support machine may hold only support stances
/// (plus the universal Neutral) and a combat machine only combat stances. The two sets are disjoint.
#[test]
fn stance_options_are_partitioned_by_role() {
    for s in Stance::SUPPORT {
        assert!(s.fits_role(true), "{s:?} must fit a support machine");
        assert!(!s.fits_role(false), "{s:?} must not fit a combat machine");
    }
    for s in Stance::COMBAT {
        assert!(s.fits_role(false), "{s:?} must fit a combat machine");
        assert!(!s.fits_role(true), "{s:?} must not fit a support machine");
    }
    assert!(
        Stance::Neutral.fits_role(true) && Stance::Neutral.fits_role(false),
        "Neutral is the universal fallback and fits both roles"
    );
    for c in Stance::COMBAT {
        assert!(
            !Stance::SUPPORT.contains(&c),
            "combat and support stance sets must be disjoint (offender {c:?})"
        );
    }
}

/// An out-of-role stance held by a saved army still loads and **degrades to neutral behaviour**
/// (FR-022): the battle is byte-identical to the same army holding Neutral, in *both* directions — a
/// support machine with a combat stance, and a combat machine with a support stance.
#[test]
fn an_out_of_role_stance_degrades_to_neutral_behaviour() {
    let rs = seed_ruleset();
    let stream = |o: &BattleOutput| serde_json::to_vec(&o.replay.games).unwrap();

    // (a) Support machine holding a combat stance (Aggressive) == the same medic Neutral. It still
    //     heals (degraded to Triage) and its support offset is forced neutral so it cannot bait fire.
    let medic_army = |st: Stance| {
        let mut a = patients_army(&rs);
        a.machines[4] = with_stance(a.machines[4].clone(), st);
        a
    };
    assert_eq!(
        stream(&run(
            &rs,
            medic_army(Stance::Aggressive),
            disperse_enemy(&rs),
            0x5011
        )),
        stream(&run(
            &rs,
            medic_army(Stance::Neutral),
            disperse_enemy(&rs),
            0x5011
        )),
        "a support machine's out-of-role combat stance must degrade to neutral behaviour"
    );

    // (b) Combat machine holding a support stance (Empower) == the same tank Neutral — the support
    //     stance carries a neutral aggro offset and no support action fires (it has no support power).
    let squad = |st: Stance| Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                with_stance(tank(&rs, "Grizzly", zone, i), st)
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
    assert_eq!(
        stream(&run(&rs, squad(Stance::Empower), enemy(), 0x5A5A)),
        stream(&run(&rs, squad(Stance::Neutral), enemy(), 0x5A5A)),
        "a combat machine's out-of-role support stance must degrade to neutral behaviour"
    );
}

/// Empower with no serviceable ally in range is well-defined (edge case): a Warden (OwnZone range)
/// alone in its zone strengthens nobody and the battle resolves without panicking.
#[test]
fn empower_with_no_allies_in_range_is_well_defined() {
    use engine::replay::{SupportKind, TickEvent};
    let rs = seed_ruleset();
    let warden_ref = UnitRef {
        side: Side::A,
        instance_id: 0,
    };
    let a = Army {
        machines: vec![
            with_stance(warden(&rs, ZoneId::Rear, 0), Stance::Empower),
            tank(&rs, "Grizzly", ZoneId::Front, 1),
            tank(&rs, "Grizzly", ZoneId::Front, 2),
            light(&rs, "Scout", ZoneId::Middle, 3),
            light(&rs, "Scout", ZoneId::Middle, 4),
        ],
    };
    let out = run(&rs, a, disperse_enemy(&rs), 0x5011);

    // The lone-zone Warden has no OwnZone ally to strengthen, so it grants nothing — no Aura events,
    // no panic. Reaching here at all proves the empty-range path is defined.
    let warden_auras = out.replay.games[0]
        .ticks
        .iter()
        .flat_map(|t| &t.events)
        .filter(|e| {
            matches!(
                e,
                TickEvent::Support { actor, kind: SupportKind::Aura, .. } if *actor == warden_ref
            )
        })
        .count();
    assert_eq!(
        warden_auras, 0,
        "a Warden alone in its own-zone range strengthens nobody"
    );
    assert!(
        !out.replay.games[0].ticks.is_empty(),
        "the battle resolved to a non-empty replay"
    );
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
