//! US3 (T036–T038): the counter-web at the *battle* level, via the public `resolve`. Curated
//! matchups over the seed ruleset assert the designed rock-paper-scissors emerges — AA hard-counters
//! air, indirect artillery can never touch air (but its splash punishes a stacked row), and no
//! single squad sweeps every matchup (SC-003). These check **correctness of shape**, not tuned
//! balance — the numbers are the balancer's job (Feature 2, P4).

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::Army;
use engine::model::ruleset::Ruleset;
use engine::model::types::{
    AuraEffect, AuraKind, AuraScope, EquipmentId, MachineTypeId, VariantId, ZoneId,
};
use engine::replay::{
    Adaptation, Fate, MatchConfig, Replay, Side, SupportKind, TickEvent, UnitRef,
};
use engine::{resolve, BattleInput, BattleOutput};

fn config() -> MatchConfig {
    MatchConfig {
        adaptation: Adaptation::Locked,
        defender_side: Side::B,
        best_of: 3,
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

/// The fate of a specific machine in the result.
fn fate_of(out: &BattleOutput, side: Side, instance_id: u8) -> Fate {
    out.result
        .machine_fates
        .iter()
        .find(|f| f.unit == UnitRef { side, instance_id })
        .expect("machine present")
        .fate
}

fn destroyed(fate: Fate) -> bool {
    matches!(fate, Fate::DestroyedAtTick(_))
}

/// Does any Hit event in the replay carry `splash = true`?
fn has_splash_hit(replay: &Replay) -> bool {
    replay.games.iter().flat_map(|g| &g.ticks).any(|t| {
        t.events
            .iter()
            .any(|e| matches!(e, TickEvent::Hit { splash: true, .. }))
    })
}

/// Did `who` land at least one Hit anywhere in the replay?
fn actor_landed_hit(replay: &Replay, who: UnitRef) -> bool {
    replay.games.iter().flat_map(|g| &g.ticks).any(|t| {
        t.events
            .iter()
            .any(|e| matches!(e, TickEvent::Hit { actor, .. } if *actor == who))
    })
}

/// A squad of two air helicopters (i0, i1) + three ground fillers (i2–i4) in Front.
fn air_squad(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            stock_instance(rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 0),
            stock_instance(rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 1),
            stock_instance(rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 2),
            stock_instance(rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 3),
            stock_instance(rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 4),
        ],
    }
}

/// T036 (AS2, stat block E): AA hard-counters air. A squad with SAM rocket-artillery destroys the
/// enemy's helicopters; a squad with no air-capable weapon leaves them untouched.
#[test]
fn aa_hard_counters_air_and_no_aa_cannot_touch_it() {
    let rs = seed_ruleset();

    // Attacker WITH AA: two SAM Sentries (reach Air) + three heavy tanks.
    let aa = Army {
        machines: vec![
            stock_instance(
                &rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                0,
            ),
            stock_instance(
                &rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                1,
            ),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 3),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 4),
        ],
    };
    let out = run(&rs, aa, air_squad(&rs), 0x5A11);
    assert!(
        destroyed(fate_of(&out, Side::B, 0)) && destroyed(fate_of(&out, Side::B, 1)),
        "AA must destroy both enemy helicopters"
    );

    // Attacker WITHOUT AA: five heavy tanks — none can target the air.
    let no_aa = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Cavalier", ZoneId::Middle, 3),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Bulwark", ZoneId::Middle, 4),
        ],
    };
    let out2 = run(&rs, no_aa, air_squad(&rs), 0x5A11);
    assert!(
        !destroyed(fate_of(&out2, Side::B, 0)) && !destroyed(fate_of(&out2, Side::B, 1)),
        "without AA the helicopters must survive (nothing can hit them)"
    );
}

/// A SAM (reach Air) must not idle when the skies are clear. Against an all-ground enemy — no aircraft
/// to engage, ever — it depresses its launchers and bombards ground instead of doing nothing.
#[test]
fn sam_bombards_ground_when_no_air_present() {
    let rs = seed_ruleset();
    let sam = Army {
        machines: vec![
            stock_instance(
                &rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                0,
            ),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 3),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Rear, 4),
        ],
    };
    let all_ground = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 2),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 3),
            stock_instance(&rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 4),
        ],
    };
    let out = run(&rs, sam, all_ground, 0x5A44);
    assert!(
        actor_landed_hit(
            &out.replay,
            UnitRef {
                side: Side::A,
                instance_id: 0
            }
        ),
        "a SAM must bombard ground (land ≥1 hit) when there is no enemy air to engage"
    );
}

/// Helis are excluded from healing: a whole-army medic mends wounded *ground* allies but never an
/// airframe, even when the heli is the one under fire. Regression guard for the `resolve_support`
/// heli skip.
#[test]
fn helis_are_never_a_heal_target() {
    let rs = seed_ruleset();
    let heli = UnitRef {
        side: Side::A,
        instance_id: 2,
    };

    // Side A: a Medic (whole-army heal reach) + a Gunship heli + a ground line that will take fire.
    let with_medic = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
            stock_instance(&rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 2),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 3),
            stock_instance(&rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 4),
        ],
    };
    // Side B: AA (a Sentry SAM engages the heli) + a ground line (wounds side A's front, so the
    // medic has ground allies to mend).
    let mixed = Army {
        machines: vec![
            stock_instance(
                &rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                0,
            ),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Cavalier", ZoneId::Front, 3),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 4),
        ],
    };
    let out = run(&rs, with_medic, mixed, 0x5A66);

    let events: Vec<&TickEvent> = out
        .replay
        .games
        .iter()
        .flat_map(|g| &g.ticks)
        .flat_map(|t| &t.events)
        .collect();

    // Non-vacuity: the heli actually takes fire, so absent the skip it WOULD become a heal candidate.
    let heli_hit = events
        .iter()
        .any(|e| matches!(e, TickEvent::Hit { target, .. } if *target == heli));
    assert!(
        heli_hit,
        "the heli must be under fire for this test to mean anything"
    );

    let heals: Vec<UnitRef> = events
        .iter()
        .filter_map(|e| match e {
            TickEvent::Support {
                target,
                kind: SupportKind::Heal,
                ..
            } => Some(*target),
            _ => None,
        })
        .collect();

    // The medic is doing its job (mending wounded ground allies)…
    assert!(
        !heals.is_empty(),
        "the medic should heal wounded ground allies"
    );
    // …but a heal never lands on the heli.
    assert!(
        !heals.iter().any(|t| *t == heli),
        "a heli must never be the target of a heal"
    );
}

/// A rear-support unit carrying a `StartShield` aura confers a match-start shield — a fraction of each
/// ally's hull — to the whole squad, so a shieldless heavy tank begins the battle with a barrier.
/// Without the aura it starts bare. (The engine mechanism; the live values ride on the ruleset row.)
#[test]
fn support_grants_a_start_shield_to_the_squad() {
    let mut rs = seed_ruleset();
    let army_a = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 2),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 3),
            stock_instance(&rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 4),
        ],
    };
    let ally = UnitRef {
        side: Side::A,
        instance_id: 0,
    }; // a Grizzly — no native shield

    // tick-0 shield (milli) of a unit in the first game.
    let start_shield = |out: &BattleOutput, u: UnitRef| -> i64 {
        out.replay.games[0].ticks[0]
            .snapshot
            .iter()
            .find(|s| s.unit == u)
            .expect("unit in snapshot")
            .shield
            .milli()
    };

    // Control: no aura on the Medic → the tank starts with no shield.
    let base = run(&rs, army_a.clone(), air_squad(&rs), 0x5A77);
    assert_eq!(start_shield(&base, ally), 0, "no aura ⇒ no start shield");

    // Grant the Medic a whole-army start-shield aura at 20% of each ally's hull.
    rs.chassis
        .get_mut(&VariantId::new("Medic"))
        .unwrap()
        .passive_aura = Some(AuraEffect {
        kind: AuraKind::StartShield,
        magnitude: 2_000, // 20% of hull, bp
        scope: AuraScope::AllAllies,
    });
    let out = run(&rs, army_a, air_squad(&rs), 0x5A77);
    let hull = rs
        .base_stats(&VariantId::new("Grizzly"))
        .unwrap()
        .hull
        .milli();
    let got = start_shield(&out, ally);
    // The first snapshot is taken after tick 0's combat, so the ~20%-of-hull barrier has already
    // soaked some fire — assert it opened with a substantial shield (between an eighth and the full
    // 20% grant), where the control had none.
    assert!(
        got >= hull / 8 && got <= hull * 20 / 100,
        "tank should open with a substantial shield from the aura: got {got}, hull {hull}"
    );
}

/// T037 (AS3/AS4): indirect artillery can *never* damage air, and its splash punishes a stacked row.
#[test]
fn artillery_never_hits_air_but_splashes_a_stacked_row() {
    let rs = seed_ruleset();

    // Attacker: five Longbow artillery (indirect, no air capability).
    let arty = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Front, 0),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Front, 2),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Middle, 3),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Middle, 4),
        ],
    };
    // Defender: two helis (air) + three scouts STACKED in Front (splash bait).
    let defender = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 0),
            stock_instance(&rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 1),
            stock_instance(&rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 2),
            stock_instance(&rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 3),
            stock_instance(&rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 4),
        ],
    };

    let out = run(&rs, arty, defender, 0xA27);

    // The helicopters are never scratched — indirect artillery cannot target air (AS3).
    assert_eq!(
        fate_of(&out, Side::B, 0),
        Fate::SurvivedWithHullPct(10_000),
        "heli 0 untouched by artillery"
    );
    assert_eq!(
        fate_of(&out, Side::B, 1),
        Fate::SurvivedWithHullPct(10_000),
        "heli 1 untouched by artillery"
    );
    // No Hit event ever targets an air unit.
    let air_units = [
        UnitRef {
            side: Side::B,
            instance_id: 0,
        },
        UnitRef {
            side: Side::B,
            instance_id: 1,
        },
    ];
    let hit_air = out.replay.games.iter().flat_map(|g| &g.ticks).any(|t| {
        t.events.iter().any(|e| match e {
            TickEvent::Hit { target, .. } => air_units.contains(target),
            _ => false,
        })
    });
    assert!(!hit_air, "no Hit event may ever land on an air unit");

    // Splash landed on the stacked front row (AS4).
    assert!(
        has_splash_hit(&out.replay),
        "artillery splash should hit the stacked row"
    );
}

/// Air-FIRST (live-testing decision): an air-capable unit engages enemy air *before* ground — it
/// clears the skies, then bombs. In a symmetric heli + ground mirror the helicopters dogfight from the
/// opening rather than ignoring each other until ground is gone (the earlier fallback behavior that
/// read as "helis fight everything but air").
#[test]
fn air_capable_units_engage_air_first() {
    let rs = seed_ruleset();

    // Symmetric heli + light-tank squads (instances 0,1 = Air helis; 2–4 = Front ground). No AA, so
    // the only unit that can hit air is a helicopter — and with air-first it should do so immediately.
    let heli_ground = |rs: &Ruleset| Army {
        machines: vec![
            stock_instance(rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 0),
            stock_instance(rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 1),
            stock_instance(rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 2),
            stock_instance(rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 3),
            stock_instance(rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 4),
        ],
    };

    let out = run(&rs, heli_ground(&rs), heli_ground(&rs), 0xA1A2);

    // The FIRST hit a helicopter lands (actor instance 0/1) must be on an air unit (target 0/1), not a
    // ground filler — proving air is prioritized over ground while both are reachable.
    let first_heli_hit = out
        .replay
        .games
        .iter()
        .flat_map(|g| &g.ticks)
        .find_map(|t| {
            t.events.iter().find_map(|e| match e {
                TickEvent::Hit { actor, target, .. } if actor.instance_id <= 1 => Some(*target),
                _ => None,
            })
        });
    let target = first_heli_hit.expect("a helicopter must land a hit");
    assert!(
        target.instance_id <= 1,
        "air-first: a helicopter's first landed hit must be on an air unit, got instance {}",
        target.instance_id,
    );
}

/// T038 (SC-003): across a round-robin of diverse archetypes, no single squad sweeps every matchup.
#[test]
fn no_single_archetype_wins_every_matchup() {
    let rs = seed_ruleset();

    let energy_mechs = |rs: &Ruleset| {
        let mut a = Army {
            machines: vec![
                stock_instance(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 0),
                stock_instance(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 1),
                stock_instance(rs, MachineTypeId::Mech, "Striker", ZoneId::Front, 2),
                stock_instance(rs, MachineTypeId::Mech, "Sentinel", ZoneId::Middle, 3),
                stock_instance(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 4),
            ],
        };
        for m in &mut a.machines {
            m.loadout.weapon = EquipmentId::new("PulseLaser"); // energy crossover
        }
        a
    };
    let kinetic_tanks = |rs: &Ruleset| Army {
        machines: vec![
            stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
            stock_instance(rs, MachineTypeId::HeavyTank, "Cavalier", ZoneId::Front, 1),
            stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
            stock_instance(rs, MachineTypeId::LightTank, "Scout", ZoneId::Middle, 3),
            stock_instance(rs, MachineTypeId::LightTank, "Hunter", ZoneId::Middle, 4),
        ],
    };
    let aa_rocket = |rs: &Ruleset| Army {
        machines: vec![
            stock_instance(
                rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                0,
            ),
            stock_instance(
                rs,
                MachineTypeId::RocketArtillery,
                "Aegis",
                ZoneId::Middle,
                1,
            ),
            stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
            stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 3),
            stock_instance(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 4),
        ],
    };
    let air_alpha = air_squad;

    type Archetype = (&'static str, fn(&Ruleset) -> Army);
    let archetypes: Vec<Archetype> = vec![
        ("energy_mechs", energy_mechs),
        ("kinetic_tanks", kinetic_tanks),
        ("aa_rocket", aa_rocket),
        ("air_alpha", air_alpha),
    ];

    // Round-robin over both attacker/defender roles; tally wins and total games per archetype.
    let mut wins = std::collections::BTreeMap::new();
    let mut games = std::collections::BTreeMap::new();
    for i in 0..archetypes.len() {
        for j in 0..archetypes.len() {
            if i == j {
                continue;
            }
            let (na, fa) = archetypes[i];
            let (nb, fb) = archetypes[j];
            let out = run(&rs, fa(&rs), fb(&rs), 0xC0DE + (i * 10 + j) as u64);
            *games.entry(na).or_insert(0) += 1;
            *games.entry(nb).or_insert(0) += 1;
            match out.result.winner {
                Side::A => *wins.entry(na).or_insert(0) += 1,
                Side::B => *wins.entry(nb).or_insert(0) += 1,
            }
        }
    }

    // SC-003 (correctness of shape): more than one archetype wins somewhere (no single dominant
    // strategy), and every archetype loses at least one game (nothing beats everything).
    let distinct_winners = wins.iter().filter(|(_, &w)| w > 0).count();
    assert!(
        distinct_winners >= 2,
        "expected ≥2 distinct winning archetypes (got {distinct_winners}); wins = {wins:?}"
    );
    for (name, total) in &games {
        let w = wins.get(name).copied().unwrap_or(0);
        assert!(
            w < *total,
            "archetype {name} won all {total} of its games (no counter exists) — wins={w}; balance regressed"
        );
    }
    // FIRST-PASS ROUGH EDGE (for the balancer, T039/Feature 2): on the placeholder numbers, air
    // alpha beats every non-AA archetype and only AA counters it — so 3 of 4 archetypes want an
    // affordable AA option, or air's alpha wants trimming, to widen the counter-web. The *shape* is
    // correct here (AA hard-counters air; air hard-counters non-AA); the *spread* is the tuning job.
}
