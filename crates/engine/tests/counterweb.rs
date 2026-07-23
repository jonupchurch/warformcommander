//! US3 (T036–T038): the counter-web at the *battle* level, via the public `resolve`. Curated
//! matchups over the seed ruleset assert the designed rock-paper-scissors emerges — AA hard-counters
//! air, indirect artillery can never touch air (but its splash punishes a stacked row), and no
//! single squad sweeps every matchup (SC-003). These check **correctness of shape**, not tuned
//! balance — the numbers are the balancer's job (Feature 2, P4).

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::Army;
use engine::model::ruleset::Ruleset;
use engine::model::types::{
    AuraEffect, AuraKind, AuraScope, Capability, EquipmentId, EquipmentModule,
    EquipmentSpec, MachineTypeId, UtilitySpec, VariantId, ZoneId,
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

/// Whether `who` ever landed a hit on one of the enemy **air** units. `air_squad` puts its two
/// helicopters at Side::B instances 0 and 1, so a hit on either is a hit on air.
fn actor_hit_air(replay: &Replay, who: UnitRef) -> bool {
    let is_heli = |u: UnitRef| u.side == Side::B && (u.instance_id == 0 || u.instance_id == 1);
    replay.games.iter().flat_map(|g| &g.ticks).any(|t| {
        t.events.iter().any(
            |e| matches!(e, TickEvent::Hit { actor, target, .. } if *actor == who && is_heli(*target)),
        )
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

/// A **flak platform** (the `AntiAir` capability, via a Flak Battery utility) lets a *ground* unit
/// engage air. Where the no-AA heavy company above leaves the helicopters untouched, heavy tanks
/// fitted with a Flak Battery target and destroy them — the air counter is no longer AA-rocket-only.
/// (The utility lives in the DB ruleset row in prod; the test injects it, as the balancer does via
/// `--ruleset`.)
#[test]
fn flak_lets_ground_units_shoot_down_aircraft() {
    let mut rs = seed_ruleset();
    rs.equipment.insert(
        EquipmentId::new("FlakBattery"),
        EquipmentModule {
            id: EquipmentId::new("FlakBattery"),
            name: "Flak Battery".into(),
            spec: EquipmentSpec::Utility(UtilitySpec {
                stat_deltas: None,
                unlocks: vec![Capability::AntiAir],
                cadence_shift: 0,
            }),
        },
    );

    // Five heavy tanks, each fitted with a Flak Battery in its first utility slot.
    let flak = |v: &str, z: ZoneId, i: u8| {
        let mut m = stock_instance(&rs, MachineTypeId::HeavyTank, v, z, i);
        m.loadout.utilities[0] = EquipmentId::new("FlakBattery");
        m
    };
    let flak_company = Army {
        machines: vec![
            flak("Grizzly", ZoneId::Front, 0),
            flak("Grizzly", ZoneId::Front, 1),
            flak("Grizzly", ZoneId::Front, 2),
            flak("Cavalier", ZoneId::Middle, 3),
            flak("Bulwark", ZoneId::Middle, 4),
        ],
    };
    let out = run(&rs, flak_company, air_squad(&rs), 0x5A11);
    assert!(
        destroyed(fate_of(&out, Side::B, 0)) && destroyed(fate_of(&out, Side::B, 1)),
        "flak-equipped ground units must be able to destroy enemy aircraft"
    );
}

/// Energy weapons contest air (v2, staged US4) — but only when the ruleset enables the mechanic
/// (`energy_air_dmg_mult > 0`), and only up close. A FRONT energy laser shoots at the helicopters;
/// the same laser in the MIDDLE cannot reach air at all (the reach advantage that keeps dedicated AA
/// distinct, FR-029), though it still fights on the ground; and with the mechanic OFF it cannot touch
/// air from anywhere (FR-028, the enable gate). Uses the seed's Heavy-mount `SiegeLaser` (Energy).
#[test]
fn energy_weapons_contest_air_up_close_only_when_enabled() {
    let off = seed_ruleset();
    let mut on = seed_ruleset();
    on.air_mods.energy_air_dmg_mult = 7_500; // ×0.75 — between plink (×0.5) and flak (×1.0)

    // A heavy company whose instance-0 tank carries an energy laser, placed in `laser_zone`. The rest
    // sit up front so instance 0 is free to test its own reach in isolation.
    let company = |rs: &Ruleset, laser_zone: ZoneId| {
        let laser = |z: ZoneId, i: u8| {
            let mut m = stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", z, i);
            m.loadout.weapon = EquipmentId::new("SiegeLaser");
            m
        };
        Army {
            machines: vec![
                laser(laser_zone, 0),
                stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
                stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
                stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Middle, 3),
                stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Middle, 4),
            ],
        }
    };
    let laser0 = UnitRef {
        side: Side::A,
        instance_id: 0,
    };

    // OFF: the Front laser cannot touch air.
    let off_out = run(&off, company(&off, ZoneId::Front), air_squad(&off), 0x5A11);
    assert!(
        !actor_hit_air(&off_out.replay, laser0),
        "with the mechanic off, an energy laser must not be able to hit air"
    );
    // ON, Front: it contests the air.
    let front_out = run(&on, company(&on, ZoneId::Front), air_squad(&on), 0x5A11);
    assert!(
        actor_hit_air(&front_out.replay, laser0),
        "with the mechanic on, a FRONT energy laser must contest air"
    );
    // ON, Middle: it cannot reach air (improvised reach is close-range only — the AA reach advantage).
    let mid_out = run(&on, company(&on, ZoneId::Middle), air_squad(&on), 0x5A11);
    assert!(
        !actor_hit_air(&mid_out.replay, laser0),
        "an improvised energy laser off the front line must not reach air (dedicated AA keeps its reach advantage)"
    );
}

/// The Mech's Rocket Pack (v2, US4, FR-026): full-rate anti-air (flak damage) but reach-limited to the
/// front line (FR-029). A Rocket-Pack Mech in the FRONT shoots at the helicopters; the same Mech in the
/// MIDDLE cannot reach air at all (dedicated AA keeps the whole-field reach advantage); a stock Mech
/// never can. The Rocket Pack is a utility, so it trades a slot for the capability.
#[test]
fn rocket_pack_gives_the_mech_front_line_anti_air() {
    let rs = seed_ruleset();
    let company = |zone: ZoneId, rocket: bool| {
        let mut mech = stock_instance(&rs, MachineTypeId::Mech, "Vanguard", zone, 0);
        if rocket {
            mech.loadout.utilities[0] = EquipmentId::new("RocketPack");
        }
        Army {
            machines: vec![
                mech,
                stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
                stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
                stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Middle, 3),
                stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Middle, 4),
            ],
        }
    };
    let mech = UnitRef {
        side: Side::A,
        instance_id: 0,
    };

    // A stock Mech (no Rocket Pack) on the front line cannot touch air.
    let stock = run(&rs, company(ZoneId::Front, false), air_squad(&rs), 0x5A11);
    assert!(
        !actor_hit_air(&stock.replay, mech),
        "a stock Mech cannot engage air"
    );
    // A Rocket-Pack Mech on the FRONT engages the helicopters.
    let front = run(&rs, company(ZoneId::Front, true), air_squad(&rs), 0x5A11);
    assert!(
        actor_hit_air(&front.replay, mech),
        "a Rocket-Pack Mech on the front line must engage air"
    );
    // A Rocket-Pack Mech in the MIDDLE cannot reach air — the reach advantage of dedicated AA.
    let mid = run(&rs, company(ZoneId::Middle, true), air_squad(&rs), 0x5A11);
    assert!(
        !actor_hit_air(&mid.replay, mech),
        "a Rocket-Pack Mech off the front line must not reach air (dedicated AA keeps the reach advantage)"
    );
}

/// Anti-air **fire discipline**: one cheap aircraft must not be able to soak an entire army's air
/// defence. Air-first targeting is right, but uncapped it made a SAM wall *anti-synergistic* — every
/// launcher locked onto a single Gunship (`ReachTag::Air` engages air exclusively) while the enemy
/// ground line went unopposed, so bringing more AA made you weaker against a one-aircraft splash.
///
/// Five launchers face one Gunship: at most `air_mods.aa_focus_per_air` (2) may engage it in any one
/// tick, and the surplus launchers bombard ground rather than idling on a target already covered.
#[test]
fn one_aircraft_cannot_monopolise_the_air_defence_network() {
    let rs = seed_ruleset();
    let heli = UnitRef {
        side: Side::A,
        instance_id: 0,
    };

    // Side A: a single Gunship over a conventional ground line (the "air splash").
    let air_splash = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 0),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Bulwark", ZoneId::Front, 3),
            stock_instance(&rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 4),
        ],
    };
    // Side B: five SAM launchers — every single one of them air-capable.
    let sam_wall = Army {
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
            stock_instance(
                &rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                2,
            ),
            stock_instance(
                &rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Rear,
                3,
            ),
            stock_instance(
                &rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Rear,
                4,
            ),
        ],
    };

    // (peak launchers engaging the heli in one tick, any launcher bombarded ground while it flew)
    let measure = |cap: u32| -> (usize, bool) {
        let mut rs = rs.clone();
        rs.air_mods.aa_focus_per_air = cap;
        let out = run(&rs, air_splash.clone(), sam_wall.clone(), 0x5A55);
        let (mut peak, mut bombarded) = (0usize, false);
        for game in &out.replay.games {
            let mut heli_alive = true;
            for tick in &game.ticks {
                let mut on_air = std::collections::BTreeSet::new();
                // `resolve_attack` emits Hit/Miss (never Shot) — those are the "engaged" signal.
                // Death is handled inline, in event order: launchers that fire *after* the heli
                // falls in the same tick are shooting ground legitimately, not dodging the budget.
                for e in &tick.events {
                    let (actor, target) = match e {
                        TickEvent::Hit { actor, target, .. }
                        | TickEvent::Miss { actor, target } => (actor, target),
                        TickEvent::Death { unit, .. } if *unit == heli => {
                            heli_alive = false;
                            continue;
                        }
                        _ => continue,
                    };
                    if actor.side != Side::B {
                        continue;
                    }
                    if *target == heli {
                        on_air.insert(actor.instance_id);
                    } else if heli_alive {
                        bombarded = true;
                    }
                }
                peak = peak.max(on_air.len());
            }
        }
        (peak, bombarded)
    };

    let (capped_peak, capped_bombarded) = measure(2);
    let (uncapped_peak, uncapped_bombarded) = measure(u32::MAX);

    // Uncapped is the old behavior, and the reason the one-aircraft splash was unanswerable: every
    // launcher piles onto the lone Gunship and the enemy ground line is never engaged at all.
    assert!(
        uncapped_peak > 2,
        "uncapped, more than 2 launchers should pile onto one aircraft (saw {uncapped_peak}) — \
         otherwise this test is not exercising the budget"
    );
    assert!(
        !uncapped_bombarded,
        "uncapped, the whole SAM wall locks onto the aircraft and never touches ground"
    );

    assert!(
        capped_peak > 0,
        "the air-defence network must still engage the aircraft"
    );
    assert!(
        capped_peak <= 2,
        "at most 2 launchers may engage one aircraft per tick, saw {capped_peak}"
    );
    assert!(
        capped_bombarded,
        "launchers beyond the air budget must bombard ground, not idle on a covered target"
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
        !heals.contains(&heli),
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

    // Control: no aura on the Medic. The tank still opens with the small Balanced-default shield
    // (v2 — the default slot is no longer a no-op), so we capture that baseline and prove the aura
    // adds a *substantial* barrier on top of it, rather than asserting a bare zero.
    let base = run(&rs, army_a.clone(), air_squad(&rs), 0x5A77);
    let base_shield = start_shield(&base, ally);

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
    // soaked some fire — assert the aura added a substantial shield (at least an eighth of hull) on
    // top of whatever the Balanced default provided.
    assert!(
        got >= base_shield + hull / 8,
        "the aura should add a substantial shield over the Balanced default: got {got}, base {base_shield}, hull {hull}"
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

/// v2 three-layer counter-web (spec 013, US1/T010): the three defensive families fail to **different**
/// threats, so a defense choice is a real counter decision rather than a strict ordering.
///
/// Penetration is the discriminator here. A Railgun bypasses shields entirely (its penetrating
/// fraction leaks straight past), but penetration does **not** bypass the ablative pool (research R2).
/// So against the same penetrating attacker, the Shield defender falls faster than the Ablative one —
/// the shield is the wrong tool, the ablative pool the right one.
#[test]
#[ignore = "v2 balance relationship (ablative vs shield vs a penetrator) measured at start-values; \
            v3 sharpened the damage matrix (spec 015 US1, start-values pending the balance/sim pass) \
            and retires Ablative from the core defense set (FR-008). Re-validate in the v3 sim pass."]
fn the_three_defensive_layers_fail_to_different_threats() {
    let rs = seed_ruleset();

    // Ground zones cap at 3 units, so spread each squad across Front + Middle.
    let zone = |i: u8| if i < 3 { ZoneId::Front } else { ZoneId::Middle };

    // A squad of heavy tanks behind one defense family, dueling a Railgun (50% penetration) squad.
    let defender = |rs: &Ruleset, defense: &str| Army {
        machines: (0..5)
            .map(|i| {
                let mut m = stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", zone(i), i);
                m.loadout.defense = EquipmentId::new(defense);
                m
            })
            .collect(),
    };
    let railgunners = |rs: &Ruleset| Army {
        machines: (0..5)
            .map(|i| {
                let mut m = stock_instance(rs, MachineTypeId::HeavyTank, "Cavalier", zone(i), i);
                m.loadout.weapon = EquipmentId::new("Railgun"); // 50% penetration
                m
            })
            .collect(),
    };

    // Squad-survival score: survivors dominate, battle duration breaks ties. Higher = outlasted.
    let survival = |defense: &str| -> i64 {
        let out = run(&rs, railgunners(&rs), defender(&rs, defense), 0xF00D);
        out.result.side(Side::B).survivors as i64 * 100_000 + out.result.duration_ticks as i64
    };

    let shield = survival("HeavyShield");
    let ablative = survival("HeavyAblative");

    // Against penetration, the ablative pool (which penetration cannot bypass) outlasts the shield
    // (which it can). If the shield somehow survived outright this still holds by the tie.
    assert!(
        ablative > shield,
        "ablative should outlast shield vs penetration: shield={shield} ablative={ablative}"
    );
}
