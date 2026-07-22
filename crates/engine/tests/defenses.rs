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
use engine::replay::{Adaptation, MatchConfig, Side};
use engine::{resolve, BattleInput};

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
