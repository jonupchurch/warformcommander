//! Emit the **derivation + legality parity battery** — the engine's own `derive_effective_stats`
//! and `validate` verdicts over a representative spread of builds — to a JSON fixture the TS mirror
//! is pinned against (Feature 4 T006 / SC-002). The client cannot run the wasm engine (P6), so the
//! Garage's live preview + edit-time gating use a **pure TS port** of the derivation/validation;
//! this fixture is the contract that the port equals the engine. Native == wasm is already
//! byte-identical (P6, `scripts/wasm-parity.mjs`), so a *native*-emitted fixture is authoritative
//! for what the server (wasm) would compute.
//!
//! `cargo run -p engine --example emit_derive_battery -- <out-file.json>`

use std::fs;
use std::path::PathBuf;

use engine::content::{seed_ruleset, stock_dials, stock_instance};
use engine::model::army::{derive_effective_stats, Army, MachineInstance};
use engine::model::ruleset::Ruleset;
use engine::model::types::{EquipmentId, Loadout, MachineTypeId, VariantId, ZoneId};
use engine::{validate_bytes, ValidateInput};
use serde_json::{json, Value};

/// A hand-built machine (custom loadout) for the derivation battery. `stock_dials` + no Plan-B —
/// the derivation ignores dials/Plan-B, so this isolates the stat math.
fn mk(
    type_id: MachineTypeId,
    variant: &str,
    weapon: &str,
    defense: &str,
    utils: &[&str],
    zone: ZoneId,
) -> MachineInstance {
    MachineInstance {
        instance_id: 0,
        type_id,
        variant_id: VariantId::new(variant),
        loadout: Loadout {
            weapon: EquipmentId::new(weapon),
            defense: EquipmentId::new(defense),
            utilities: utils.iter().map(|u| EquipmentId::new(*u)).collect(),
        },
        dials: stock_dials(),
        plan_b: vec![],
        zone,
    }
}

/// One derive case: the engine's `derive_effective_stats` verdict, tagged so the TS port can
/// compare both the success (full `EffectiveStats`) and the structural-error branch.
fn derive_case(rs: &Ruleset, label: &str, m: MachineInstance) -> Value {
    let expected = match derive_effective_stats(&m, rs) {
        Ok(stats) => json!({ "ok": true, "stats": serde_json::to_value(&stats).unwrap() }),
        Err(e) => json!({ "ok": false, "error": serde_json::to_value(&e).unwrap() }),
    };
    json!({ "label": label, "instance": serde_json::to_value(&m).unwrap(), "expected": expected })
}

/// One validate case: the exact `validate_bytes` response the server (wasm) would return for this
/// army — `{status:"ok",powerRating}` or `{status:"invalid",errors:[...]}` (order-significant).
fn validate_case(rs: &Ruleset, label: &str, army: &Army) -> Value {
    let input = ValidateInput {
        army: army.clone(),
        ruleset: rs.clone(),
    };
    let out = validate_bytes(&serde_json::to_vec(&input).unwrap());
    let expected: Value = serde_json::from_slice(&out).unwrap();
    json!({ "label": label, "army": serde_json::to_value(army).unwrap(), "expected": expected })
}

/// The 21 canonical stock builds (every type × variant) — all base weapons/mounts, the support
/// shield hull, the air-locked heli, the immobile Command Post.
const STOCK: &[(MachineTypeId, &str, ZoneId)] = &[
    (MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front),
    (MachineTypeId::HeavyTank, "Cavalier", ZoneId::Front),
    (MachineTypeId::HeavyTank, "Bulwark", ZoneId::Front),
    (MachineTypeId::LightTank, "Scout", ZoneId::Front),
    (MachineTypeId::LightTank, "Hunter", ZoneId::Front),
    (MachineTypeId::LightTank, "Outrider", ZoneId::Front),
    (MachineTypeId::Mech, "Vanguard", ZoneId::Middle),
    (MachineTypeId::Mech, "Striker", ZoneId::Middle),
    (MachineTypeId::Mech, "Sentinel", ZoneId::Middle),
    (MachineTypeId::AttackHeli, "Gunship", ZoneId::Air),
    (MachineTypeId::AttackHeli, "Interceptor", ZoneId::Air),
    (MachineTypeId::AttackHeli, "Warhog", ZoneId::Air),
    (MachineTypeId::RocketArtillery, "Sentry", ZoneId::Middle),
    (MachineTypeId::RocketArtillery, "Aegis", ZoneId::Middle),
    (MachineTypeId::RocketArtillery, "Deluge", ZoneId::Middle),
    (MachineTypeId::Artillery, "Longbow", ZoneId::Rear),
    (MachineTypeId::Artillery, "Siege", ZoneId::Rear),
    (MachineTypeId::Artillery, "Marksman", ZoneId::Rear),
    (MachineTypeId::RearSupport, "Medic", ZoneId::Rear),
    (MachineTypeId::RearSupport, "Warden", ZoneId::Rear),
    (MachineTypeId::RearSupport, "CommandPost", ZoneId::Rear),
];

/// A canonical legal 5-machine army (mirrors the golden battery's Side A).
fn legal_army(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
            stock_instance(rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 1),
            stock_instance(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 2),
            stock_instance(rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 3),
            stock_instance(rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 4),
        ],
    }
}

fn main() {
    let out_path = PathBuf::from(
        std::env::args()
            .nth(1)
            .expect("usage: emit_derive_battery <out-file.json>"),
    );
    let rs = seed_ruleset();

    // --- Derivation battery ---
    let mut derive_cases: Vec<Value> = Vec::new();
    for (type_id, variant, zone) in STOCK {
        let m = stock_instance(&rs, *type_id, variant, *zone, 0);
        derive_cases.push(derive_case(&rs, &format!("stock:{variant}"), m));
    }
    // Hand-built variety on a Heavy chassis: weapon swaps, defense layers, capability unlocks.
    derive_cases.push(derive_case(
        &rs,
        "grizzly:siege-laser(off-family)",
        mk(
            MachineTypeId::HeavyTank,
            "Grizzly",
            "SiegeLaser",
            "StandardHullHeavy",
            &["FireControl", "DriveServos", "Autoloader"],
            ZoneId::Front,
        ),
    ));
    derive_cases.push(derive_case(
        &rs,
        "grizzly:railgun(deep+pen+siege)",
        mk(
            MachineTypeId::HeavyTank,
            "Grizzly",
            "Railgun",
            "StandardHullHeavy",
            &["FireControl", "DriveServos", "Autoloader"],
            ZoneId::Front,
        ),
    ));
    derive_cases.push(derive_case(
        &rs,
        "grizzly:composite+combatai(armor+move+cadence+planb)",
        mk(
            MachineTypeId::HeavyTank,
            "Grizzly",
            "HeavyCannon",
            "CompositeArmor",
            &["Autoloader", "DriveServos", "CombatAI"],
            ZoneId::Front,
        ),
    ));
    derive_cases.push(derive_case(
        &rs,
        "grizzly:deflector-shield",
        mk(
            MachineTypeId::HeavyTank,
            "Grizzly",
            "HeavyCannon",
            "DeflectorShield",
            &["FireControl", "DriveServos", "Autoloader"],
            ZoneId::Front,
        ),
    ));
    derive_cases.push(derive_case(
        &rs,
        "grizzly:blast-plating(special-mitigation)",
        mk(
            MachineTypeId::HeavyTank,
            "Grizzly",
            "HeavyCannon",
            "BlastPlating",
            &["FireControl", "DriveServos", "Autoloader"],
            ZoneId::Front,
        ),
    ));
    derive_cases.push(derive_case(
        &rs,
        "grizzly:rangefinder(reach-deepen)",
        mk(
            MachineTypeId::HeavyTank,
            "Grizzly",
            "HeavyCannon",
            "StandardHullHeavy",
            &["Rangefinder", "DriveServos", "Autoloader"],
            ZoneId::Front,
        ),
    ));
    derive_cases.push(derive_case(
        &rs,
        "grizzly:sensor-suite(target-air)",
        mk(
            MachineTypeId::HeavyTank,
            "Grizzly",
            "HeavyCannon",
            "StandardHullHeavy",
            &["SensorSuite", "DriveServos", "Autoloader"],
            ZoneId::Front,
        ),
    ));
    derive_cases.push(derive_case(
        &rs,
        "scout:fast-cycle-shield+ecm",
        mk(
            MachineTypeId::LightTank,
            "Scout",
            "Autocannon",
            "FastCycleShield",
            &["FireControl", "DriveServos", "ECMSuite"],
            ZoneId::Front,
        ),
    ));
    derive_cases.push(derive_case(
        &rs,
        "gunship:sensor(air-locked-stays-none)",
        mk(
            MachineTypeId::AttackHeli,
            "Gunship",
            "RocketPods",
            "StandardHullHeli",
            &["SensorSuite", "FireControl", "DriveServos"],
            ZoneId::Air,
        ),
    ));
    derive_cases.push(derive_case(
        &rs,
        "commandpost:four-utility(immobile+servos)",
        mk(
            MachineTypeId::RearSupport,
            "CommandPost",
            "RepairBeam",
            "StandardHullSupport",
            &["FireControl", "DriveServos", "Autoloader", "ECMSuite"],
            ZoneId::Rear,
        ),
    ));
    // Structural-error branches.
    derive_cases.push(derive_case(
        &rs,
        "err:unknown-equipment",
        mk(
            MachineTypeId::HeavyTank,
            "Grizzly",
            "NoSuchGun",
            "StandardHullHeavy",
            &["FireControl", "DriveServos", "Autoloader"],
            ZoneId::Front,
        ),
    ));
    derive_cases.push(derive_case(
        &rs,
        "err:wrong-slot-kind(defense-in-weapon)",
        mk(
            MachineTypeId::HeavyTank,
            "Grizzly",
            "CompositeArmor",
            "StandardHullHeavy",
            &["FireControl", "DriveServos", "Autoloader"],
            ZoneId::Front,
        ),
    ));
    derive_cases.push(derive_case(
        &rs,
        "err:unknown-variant",
        mk(
            MachineTypeId::HeavyTank,
            "Ghost",
            "HeavyCannon",
            "StandardHullHeavy",
            &["FireControl", "DriveServos", "Autoloader"],
            ZoneId::Front,
        ),
    ));

    // --- Legality (validate) battery ---
    let mut validate_cases: Vec<Value> = Vec::new();
    validate_cases.push(validate_case(&rs, "legal:5-army", &legal_army(&rs)));
    {
        let mut a = legal_army(&rs);
        a.machines.pop();
        validate_cases.push(validate_case(&rs, "v1:wrong-size", &a));
    }
    {
        let mut a = legal_army(&rs);
        a.machines[2].zone = ZoneId::Front;
        a.machines[4].zone = ZoneId::Front; // 3 ground machines already? Grizzly+Scout in Front → +2 = 4
        validate_cases.push(validate_case(&rs, "v2:zone-cap", &a));
    }
    {
        let mut a = legal_army(&rs);
        a.machines[0].zone = ZoneId::Air; // heavy tank off home zone
        validate_cases.push(validate_case(&rs, "v3:off-home-zone", &a));
    }
    {
        let mut a = legal_army(&rs);
        a.machines[0].loadout.weapon = EquipmentId::new("Autocannon"); // light gun on heavy
        validate_cases.push(validate_case(&rs, "v4:mount-mismatch", &a));
    }
    {
        let mut a = legal_army(&rs);
        a.machines[0].loadout.utilities = vec![
            EquipmentId::new("FireControl"),
            EquipmentId::new("FireControl"),
            EquipmentId::new("Autoloader"),
        ];
        validate_cases.push(validate_case(&rs, "v5:duplicate-utility", &a));
    }
    {
        let mut a = legal_army(&rs);
        a.machines[1].loadout.utilities = vec![EquipmentId::new("FireControl")]; // too few
        validate_cases.push(validate_case(&rs, "v5:wrong-utility-count", &a));
    }
    {
        use engine::model::types::{
            DialKey, DialValue, MovementMode, PlanBSlot, PlanBTrigger, Stance, TriggerCondition,
        };
        let mut a = legal_army(&rs);
        // Scout (no Combat AI) with two Plan-B triggers → only 1 slot.
        a.machines[1].plan_b = vec![
            PlanBTrigger {
                slot: PlanBSlot::Slot1,
                condition: TriggerCondition::HullBelowPct(5_000),
                dial: DialKey::Movement,
                plan_b_value: DialValue::Movement(MovementMode::FallBack),
            },
            PlanBTrigger {
                slot: PlanBSlot::Slot2,
                condition: TriggerCondition::AfterTick(100),
                dial: DialKey::Stance,
                plan_b_value: DialValue::Stance(Stance::Aggressive),
            },
        ];
        validate_cases.push(validate_case(&rs, "v6:ungated-2nd-planb", &a));
    }
    {
        use engine::model::types::Stance;
        let mut a = legal_army(&rs);
        a.machines[0].dials.stance = Stance::Opportunist; // no Combat AI
        validate_cases.push(validate_case(&rs, "v7:ungated-dial", &a));
    }
    {
        use engine::model::types::MovementMode;
        let mut a = legal_army(&rs);
        a.machines[3].dials.movement = MovementMode::Advance; // air-locked heli
        validate_cases.push(validate_case(&rs, "v8:movement-on-air-locked", &a));
    }
    {
        let mut a = legal_army(&rs);
        a.machines.pop(); // V1
        a.machines[0].zone = ZoneId::Air; // V3
        validate_cases.push(validate_case(&rs, "multi:v1+v3-accumulate", &a));
    }

    let fixture = json!({
        "note": "Generated by `cargo run -p engine --example emit_derive_battery`. Engine parity \
                 contract for the pure TS derivation/validation mirror (Feature 4 T006, SC-002). \
                 Native == wasm is byte-identical (P6), so native output is authoritative.",
        "ruleset": serde_json::to_value(&rs).unwrap(),
        "deriveCases": derive_cases,
        "validateCases": validate_cases,
    });

    let bytes = serde_json::to_vec_pretty(&fixture).expect("serialize fixture");
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).expect("create out dir");
    }
    fs::write(&out_path, &bytes).expect("write fixture");
    println!(
        "wrote {} derive cases + {} validate cases ({} bytes) to {}",
        derive_cases.len(),
        validate_cases.len(),
        bytes.len(),
        out_path.display()
    );
}
