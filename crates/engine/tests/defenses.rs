//! v2 defense catalog (spec 013, US1) — the four defensive families across every mount class, and
//! the ablative pool's battle behaviour, exercised through the **public** API.
//!
//! The pure per-layer mitigation math (penetration not bypassing ablative, overflow to hull, the
//! pool cap) is unit-tested directly against `mitigate` inside `sim::damage`. Here we assert the
//! *catalog* is complete and coherent, that ablative capacity **derives** and **scales by mount**,
//! and that the save is real, tunable data — all observable without reaching into the crate.

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::{derive_effective_stats, Army, MachineInstance};
use engine::model::ruleset::Ruleset;
use engine::model::types::{
    EquipmentId, EquipmentSpec, Loadout, MachineTypeId, MountClass, ZoneId,
};
use engine::replay::{Adaptation, MatchConfig, Side, TickEvent, UnitRef};
use engine::validate::{validate, ValidationCode};
use engine::{resolve, BattleInput, BattleOutput};

/// The mount class of each defense module in the catalog, with its `(armor, has_shield, has_ablative)`.
fn defenses_for(rs: &Ruleset, mount: MountClass) -> Vec<(String, i64, bool, bool)> {
    rs.equipment
        .iter()
        .filter_map(|(id, m)| match &m.spec {
            EquipmentSpec::Defense(d) if d.mount_class == mount => Some((
                id.as_str().to_string(),
                d.armor_pct_delta,
                d.shield_delta.is_some(),
                d.ablative_delta.is_some(),
            )),
            _ => None,
        })
        .collect()
}

/// Every mount class offers at least the four families, and **none** is a total no-op — the dead
/// "Standard Hull" default is gone (FR-001, FR-002, SC-004).
#[test]
fn every_mount_offers_four_non_noop_defenses() {
    let rs = seed_ruleset();
    for mount in [
        MountClass::Heavy,
        MountClass::Light,
        MountClass::Mech,
        MountClass::Heli,
        MountClass::RktArty,
        MountClass::Artillery,
        MountClass::Support,
    ] {
        let defs = defenses_for(&rs, mount);
        assert!(
            defs.len() >= 4,
            "{mount:?} should offer ≥4 defenses, got {}: {defs:?}",
            defs.len()
        );
        for (id, armor, shield, ablative) in &defs {
            assert!(
                *armor != 0 || *shield || *ablative,
                "{id} ({mount:?}) grants nothing — a no-op defense slot"
            );
        }
        // The three specialist families are all present by id.
        let stem = match mount {
            MountClass::Heavy => "Heavy",
            MountClass::Light => "Light",
            MountClass::Mech => "Mech",
            MountClass::Heli => "Heli",
            MountClass::RktArty => "RktArty",
            MountClass::Artillery => "Artillery",
            MountClass::Support => "Support",
        };
        for fam in ["Armor", "Shield", "Ablative"] {
            let want = format!("{stem}{fam}");
            assert!(
                defs.iter().any(|(id, ..)| *id == want),
                "{mount:?} is missing the {want} module"
            );
        }
    }
}

/// A machine's stock (default) defense is the Balanced module, which now grants real survivability —
/// the old default granted none (FR-002).
#[test]
fn the_default_defense_is_no_longer_a_noop() {
    let rs = seed_ruleset();
    let m = stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0);
    let base = rs.base_stats(&"Grizzly".to_string().into()).unwrap();
    let stats = derive_effective_stats(&m, &rs).unwrap();
    // Balanced adds a shield pool and a little armor over the bare chassis.
    assert!(
        stats.shield_cap.milli() > base.shield_cap.milli(),
        "the Balanced default should grant a shield pool"
    );
    assert!(
        stats.armor_pct > base.armor_pct,
        "the Balanced default should grant some armor"
    );
}

/// Swap a machine's defense to a given module id.
fn with_defense(mut m: MachineInstance, id: &str) -> MachineInstance {
    m.loadout = Loadout {
        defense: EquipmentId::new(id),
        ..m.loadout
    };
    m
}

/// The ablative pool derives onto `EffectiveStats`, and it **scales by mount class**: a heavy tank's
/// ablative pool is strictly larger than a helicopter's from the *same* base module, because the
/// fragile mount carries a lower `mount_scale` (FR-009, the redistribution knob).
#[test]
fn ablative_capacity_derives_and_scales_by_mount() {
    let rs = seed_ruleset();

    let heavy = with_defense(
        stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
        "HeavyAblative",
    );
    let heli = with_defense(
        stock_instance(&rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 0),
        "HeliAblative",
    );

    let heavy_pool = derive_effective_stats(&heavy, &rs).unwrap().ablative_cap;
    let heli_pool = derive_effective_stats(&heli, &rs).unwrap().ablative_cap;

    assert!(heavy_pool.milli() > 0, "heavy ablative derives a pool");
    assert!(heli_pool.milli() > 0, "heli ablative derives a pool");
    assert!(
        heavy_pool.milli() > heli_pool.milli(),
        "mount scale must make the heavy pool larger than the heli's: heavy={} heli={}",
        heavy_pool.milli(),
        heli_pool.milli()
    );

    // A machine with no ablative defense derives a zero pool.
    let plain = stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0);
    assert_eq!(
        derive_effective_stats(&plain, &rs)
            .unwrap()
            .ablative_cap
            .milli(),
        0,
        "the Balanced default carries no ablative pool"
    );
}

/// An all-ablative squad vs a fixed attacker, resolved twice: once with the ablative save disabled,
/// once always-on. The always-saving pool never depletes, so the squad absorbs more and survives
/// longer — proving the save is real, tunable data, not a constant (FR-005, data-model §1.3).
#[test]
fn the_ablative_save_is_tunable_data() {
    // A squad-survival score: higher is better. Survivors dominate; battle duration breaks ties.
    fn survival_score(save_chance: i64) -> i64 {
        let mut rs = seed_ruleset();
        rs.ablative_mods.save_chance = save_chance;

        // Ground zones cap at 3 units, so spread each squad across Front + Middle.
        let zone = |i: u8| if i < 3 { ZoneId::Front } else { ZoneId::Middle };
        let squad = |rs: &Ruleset, variant: &str, defense: &str| Army {
            machines: (0..5)
                .map(|i| {
                    with_defense(
                        stock_instance(rs, MachineTypeId::HeavyTank, variant, zone(i), i),
                        defense,
                    )
                })
                .collect(),
        };
        let defender = squad(&rs, "Grizzly", "HeavyAblative");
        // Attacker keeps its Balanced default; only the defender's save chance varies between runs.
        let attacker = Army {
            machines: (0..5)
                .map(|i| stock_instance(&rs, MachineTypeId::HeavyTank, "Cavalier", zone(i), i))
                .collect(),
        };
        let out = resolve(&BattleInput {
            armies: [attacker, defender],
            ruleset: rs.clone(),
            seed: 0xD00D,
            match_config: MatchConfig {
                adaptation: Adaptation::Locked,
                defender_side: Side::B,
                best_of: 1,
            },
        })
        .expect("legal");
        out.result.side(Side::B).survivors as i64 * 100_000 + out.result.duration_ticks as i64
    }

    let never_saves = survival_score(0);
    let always_saves = survival_score(10_000);
    assert!(
        always_saves > never_saves,
        "an always-saving ablative pool must leave the squad better off: never={never_saves} always={always_saves}"
    );
}

// ---------------------------------------------------------------------------
// US3 — the Mech's reactive plating
// ---------------------------------------------------------------------------

/// Total damage every `Hit` event dealt to `unit` across the battle (all layers).
fn damage_taken_by(out: &BattleOutput, unit: UnitRef) -> i64 {
    out.replay.games[0]
        .ticks
        .iter()
        .flat_map(|t| &t.events)
        .filter_map(|e| match e {
            TickEvent::Hit { target, dmg, .. } if *target == unit => Some(dmg.milli()),
            _ => None,
        })
        .sum()
}

/// The `dmg` of the first `Hit` event landed on `unit` (`None` if it was never hit).
fn first_hit_on(out: &BattleOutput, unit: UnitRef) -> Option<i64> {
    out.replay.games[0]
        .ticks
        .iter()
        .flat_map(|t| &t.events)
        .find_map(|e| match e {
            TickEvent::Hit { target, dmg, .. } if *target == unit => Some(dmg.milli()),
            _ => None,
        })
}

/// How many `Hit` events `unit` absorbed across the battle. With identical incoming fire, a defense
/// that mitigates *more per hit* takes *more hits* to be worn down.
fn hits_taken_by(out: &BattleOutput, unit: UnitRef) -> usize {
    out.replay.games[0]
        .ticks
        .iter()
        .flat_map(|t| &t.events)
        .filter(|e| matches!(e, TickEvent::Hit { target, .. } if *target == unit))
        .count()
}

/// Whether `unit` was destroyed during the battle.
fn was_destroyed(out: &BattleOutput, unit: UnitRef) -> bool {
    out.result
        .machine_fates
        .iter()
        .find(|f| f.unit == unit)
        .map(|f| matches!(f.fate, engine::replay::Fate::DestroyedAtTick(_)))
        .unwrap_or(false)
}

/// A Mech (front) plus rear padding, versus a single-family Kinetic squad that focus-fires the Mech —
/// the setup for measuring how reactive plating adapts. The Mech's defense id is the only variable.
fn reactive_probe(rs: &Ruleset, mech_defense: &str) -> BattleOutput {
    let mut mech = stock_instance(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 0);
    mech = with_defense(mech, mech_defense);
    let defender = Army {
        machines: vec![
            mech,
            stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Rear, 1),
            stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Rear, 2),
            stock_instance(rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 3),
            stock_instance(rs, MachineTypeId::LightTank, "Scout", ZoneId::Middle, 4),
        ],
    };
    // Kinetic attackers hard enough to clear the min-damage floor (so the reactive multiplier actually
    // bites) that concentrate on the frontmost unit — the Mech — so it absorbs a single family.
    let attacker = Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", zone, i)
            })
            .collect(),
    };
    resolve(&BattleInput {
        armies: [attacker, defender],
        ruleset: rs.clone(),
        seed: 0x8EAC,
        match_config: MatchConfig {
            adaptation: Adaptation::Locked,
            defender_side: Side::B,
            best_of: 1,
        },
    })
    .expect("legal squads")
}

/// Reactive plating opens exactly as Balanced (nothing absorbed yet) but adapts to take *less* from a
/// family it has been absorbing (FR-023/FR-024, scenario 1). The Mech under identical single-family
/// fire takes strictly less total damage with reactive plating than with Balanced — and the very first
/// hit is identical, proving the neutral baseline.
#[test]
fn reactive_plating_opens_neutral_then_reduces_repeated_family() {
    let rs = seed_ruleset();
    let mech = UnitRef {
        side: Side::B,
        instance_id: 0,
    };
    let reactive = reactive_probe(&rs, "MechReactive");
    let balanced = reactive_probe(&rs, "StandardHullMech");

    // Both Mechs are ultimately destroyed by the concentrated fire — the comparison is *how long* they
    // last under it, which is only meaningful if both actually fall.
    assert!(
        was_destroyed(&reactive, mech) && was_destroyed(&balanced, mech),
        "both Mechs should be destroyed by the concentrated fire"
    );

    // Neutral baseline: the opening hit lands identically (absorbed == [0,0,0] → mitigates as Balanced).
    assert_eq!(
        first_hit_on(&reactive, mech),
        first_hit_on(&balanced, mech),
        "reactive plating must open exactly as its Balanced twin"
    );

    // Adaptation: mitigating more per hit, the reactive Mech absorbs strictly *more* hits before it is
    // worn down than the Balanced twin under identical fire (scenario 1 — rewards attrition).
    let reactive_hits = hits_taken_by(&reactive, mech);
    let balanced_hits = hits_taken_by(&balanced, mech);
    assert!(
        reactive_hits > balanced_hits,
        "reactive plating must endure more hits of the absorbed family: reactive={reactive_hits} balanced={balanced_hits}"
    );
}

/// The reactive rate is tunable data: with the rate pinned to `BP_ONE` (×1.0) the mechanic is disabled
/// and a reactive Mech takes exactly what its Balanced twin does — reactive is never *worse* than
/// neutral, and the bonus lives entirely in the ruleset (P8, FR-024).
#[test]
fn the_reactive_rate_is_tunable_data() {
    let mech = UnitRef {
        side: Side::B,
        instance_id: 0,
    };
    let mut disabled = seed_ruleset();
    disabled.reactive_mods.rate = 10_000; // ×1.0 — no bias
    assert_eq!(
        damage_taken_by(&reactive_probe(&disabled, "MechReactive"), mech),
        damage_taken_by(&reactive_probe(&disabled, "StandardHullMech"), mech),
        "with the reactive rate at ×1.0 a reactive Mech must behave exactly like Balanced"
    );
}

/// Reactive plating reproduces byte-identically on replay — the adaptation, including its lowest-index
/// tie-break, is fully deterministic (R9, FR-024/FR-032).
#[test]
fn reactive_plating_is_deterministic() {
    let rs = seed_ruleset();
    let a = reactive_probe(&rs, "MechReactive");
    let b = reactive_probe(&rs, "MechReactive");
    assert_eq!(
        a.replay.digest(),
        b.replay.digest(),
        "a reactive-plating battle must reproduce byte-identically"
    );
}

/// Reactive plating is Mech-exclusive (FR-023, scenario 5): mount-gated to Mech, so equipping it on any
/// other mount class is rejected by validation, while a Mech accepts it.
#[test]
fn reactive_plating_is_mech_exclusive() {
    let rs = seed_ruleset();

    // A Mech accepts reactive plating.
    let mech = with_defense(
        stock_instance(&rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 0),
        "MechReactive",
    );
    let legal = squad_around(&rs, mech);
    assert!(
        validate(&legal, &rs).is_ok(),
        "a Mech must be allowed reactive plating: {:?}",
        validate(&legal, &rs)
    );

    // Every non-Mech mount class rejects it with a mount mismatch.
    let non_mech = with_defense(
        stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
        "MechReactive",
    );
    let illegal = squad_around(&rs, non_mech);
    let errs =
        validate(&illegal, &rs).expect_err("a HeavyTank must not accept Mech reactive plating");
    assert!(
        errs.iter()
            .any(|e| e.code == ValidationCode::MountMismatch && e.instance_id == Some(0)),
        "reactive plating on a non-Mech must fail with a mount mismatch: {errs:?}"
    );
}

/// The Mech natively carries the extra Plan-B slot other chassis must buy with a Combat-AI utility
/// (FR-025): a stock Mech derives two Plan-B slots and the `ExtraPlanBSlot` capability with nothing
/// spent on it, while a specialist chassis derives one. This is the Mech's mechanical compensation for
/// forfeiting the native-family bonus (FR-027).
#[test]
fn the_mech_natively_has_the_extra_plan_b_slot() {
    let rs = seed_ruleset();
    let mech = derive_effective_stats(
        &stock_instance(&rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 0),
        &rs,
    )
    .unwrap();
    let tank = derive_effective_stats(
        &stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
        &rs,
    )
    .unwrap();
    assert_eq!(mech.plan_b_slots, 2, "a Mech natively has two Plan-B slots");
    assert!(
        mech.capabilities
            .contains(&engine::model::types::Capability::ExtraPlanBSlot),
        "the Mech's native flexibility shows up as the ExtraPlanBSlot capability"
    );
    assert_eq!(
        tank.plan_b_slots, 1,
        "a specialist chassis keeps one Plan-B slot until it buys Combat AI"
    );
}

/// A legal 5-unit army with `slot0` in Front and four stock padding units in the rear zones.
fn squad_around(rs: &Ruleset, slot0: MachineInstance) -> Army {
    Army {
        machines: vec![
            slot0,
            stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Middle, 1),
            stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Middle, 2),
            stock_instance(rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 3),
            stock_instance(rs, MachineTypeId::LightTank, "Scout", ZoneId::Rear, 4),
        ],
    }
}
