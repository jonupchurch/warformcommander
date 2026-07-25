//! Army validation — the trust boundary (US2, T030; FR-009, Principle II, SC-005).
//!
//! `validate(army, ruleset)` applies rules **V1–V8** (data-model) *before any simulation*, so a
//! battle never runs on an illegal army. It is the **shared** function the server runs on submitted
//! armies (never trust client state) and the Garage UI runs at edit time — same function, same
//! verdicts (P8). It collects **every** violation (doesn't short-circuit) so a UI can surface them
//! all at once, each with a machine-readable [`ValidationCode`] + a human reason.

use serde::{Deserialize, Serialize};

use crate::model::army::{derive_effective_stats, Army, DerivationError, MachineInstance};
use crate::model::ruleset::Ruleset;
use crate::model::types::{
    Capability, DialValue, EquipmentId, EquipmentSpec, MachineTypeId, MovementMode, PlanBSlot,
    SlotLayout, ZoneId,
};

/// Zone caps (game rules, not tunable balance): ground rows hold 3, Air holds 2.
const MAX_PER_GROUND_ZONE: u8 = 3;
const MAX_AIR: u8 = 2;

/// The machine-readable rule that rejected a build (data-model V1–V8).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum ValidationCode {
    /// V1 — squad size must be exactly 5.
    SquadSize,
    /// V2 — zone cap breach (ground ≤ 3, Air ≤ 2).
    ZoneCap,
    /// V3 — machine placed outside a home zone of its type.
    HomeZone,
    /// V4 — weapon/defense mount class doesn't match the machine.
    MountMismatch,
    /// V5 — wrong utility count or a duplicate utility.
    Utilities,
    /// V6 — too many Plan-B triggers, or a Slot-2 trigger without the unlocking capability.
    PlanB,
    /// V7 — a dial option not unlocked by the machine's capabilities.
    DialGating,
    /// V8 — a movement order on an immobile / air-locked machine.
    Movement,
    /// A referenced id is absent or a slot holds the wrong kind (surfaced from derivation).
    Structural,
}

/// A single rejection: which rule, a human reason, and the offending machine (if applicable).
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationError {
    pub code: ValidationCode,
    pub reason: String,
    /// The `instance_id` of the machine at fault, or `None` for army-level rules (V1/V2).
    pub instance_id: Option<u8>,
}

impl ValidationError {
    fn army(code: ValidationCode, reason: impl Into<String>) -> ValidationError {
        ValidationError {
            code,
            reason: reason.into(),
            instance_id: None,
        }
    }
    fn machine(code: ValidationCode, id: u8, reason: impl Into<String>) -> ValidationError {
        ValidationError {
            code,
            reason: reason.into(),
            instance_id: Some(id),
        }
    }
}

/// Validate an army against the ruleset. `Ok(())` if legal; otherwise every violation found.
pub fn validate(army: &Army, ruleset: &Ruleset) -> Result<(), Vec<ValidationError>> {
    let mut errors = Vec::new();

    // V1 — squad size.
    if army.machines.len() != crate::model::army::SQUAD_SIZE {
        errors.push(ValidationError::army(
            ValidationCode::SquadSize,
            format!(
                "squad has {} machines; exactly {} are required",
                army.machines.len(),
                crate::model::army::SQUAD_SIZE
            ),
        ));
    }

    // V2 — zone caps.
    for (zone, count) in army.zone_counts() {
        let cap = if zone == ZoneId::Air {
            MAX_AIR
        } else {
            MAX_PER_GROUND_ZONE
        };
        if count > cap {
            errors.push(ValidationError::army(
                ValidationCode::ZoneCap,
                format!("{count} machines in {zone:?} exceeds the cap of {cap}"),
            ));
        }
    }

    // V3–V8 — per machine. A living-Commander army grants every machine a survival-gated bonus Plan-B
    // slot (US5): it is *allowed* at declaration here, and gated to Commander-survival at runtime
    // (behavior.rs). So the presence of a Commander in the roster relaxes the Slot-2 requirement.
    let has_commander = army
        .machines
        .iter()
        .any(|m| m.type_id == MachineTypeId::Commander);
    for m in &army.machines {
        validate_machine(m, ruleset, has_commander, &mut errors);
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn validate_machine(
    m: &MachineInstance,
    ruleset: &Ruleset,
    army_has_commander: bool,
    errors: &mut Vec<ValidationError>,
) {
    let id = m.instance_id;
    let Some(mtype) = ruleset.machine_type(m.type_id) else {
        errors.push(ValidationError::machine(
            ValidationCode::Structural,
            id,
            format!("unknown machine type {:?}", m.type_id),
        ));
        return;
    };

    // V3 — home-zone eligibility.
    if !mtype.home_zones.contains(&m.zone) {
        errors.push(ValidationError::machine(
            ValidationCode::HomeZone,
            id,
            format!("{:?} may not start in {:?}", m.type_id, m.zone),
        ));
    }

    // V4 — weapon + defense mount class must match the machine's mount.
    check_mount(
        ruleset,
        &m.loadout.weapon,
        mtype.mount_class,
        "weapon",
        id,
        errors,
    );
    check_mount(
        ruleset,
        &m.loadout.defense,
        mtype.mount_class,
        "defense",
        id,
        errors,
    );

    // V5 — utility count + no duplicates.
    let slots = m.variant_slot_layout(ruleset).unwrap_or(mtype.slot_layout);
    validate_utilities(m, slots, ruleset, errors);

    // Capability-dependent rules (V6–V8) need the derived stats.
    match derive_effective_stats(m, ruleset) {
        Ok(stats) => {
            // V6 — Plan-B count + Slot-2 gating. A friendly Commander in the roster grants a survival-
            // gated bonus slot (US5), allowed at declaration and capped at the two real slots; it only
            // fires while the Commander lives (behavior.rs). Combat AI still grants its own 2nd slot.
            let effective_slots = stats
                .plan_b_slots
                .saturating_add(u8::from(army_has_commander))
                .min(2);
            if m.plan_b.len() > effective_slots as usize {
                errors.push(ValidationError::machine(
                    ValidationCode::PlanB,
                    id,
                    format!(
                        "{} Plan-B triggers exceed the {} available slots (Combat AI or a Commander grants a 2nd)",
                        m.plan_b.len(),
                        effective_slots
                    ),
                ));
            }
            if effective_slots < 2 && m.plan_b.iter().any(|t| t.slot == PlanBSlot::Slot2) {
                errors.push(ValidationError::machine(
                    ValidationCode::PlanB,
                    id,
                    "a Slot-2 Plan-B trigger requires the Combat-AI capability or a friendly Commander"
                        .to_string(),
                ));
            }

            // V7 (v3 US3): dial *options* are ungated (a `TargetAir` filter on a unit with no air reach
            // is simply inert; Movement/Stance are universal) — but a **DamageType** Plan-B (Adaptive
            // Munitions) is capability-gated: only a machine carrying `AdaptiveMunitions` may switch its
            // outgoing damage type mid-battle. Everything else falls through per design §12 Q5.
            if m
                .plan_b
                .iter()
                .any(|t| matches!(t.plan_b_value, DialValue::DamageType(_)))
                && !stats.capabilities.contains(&Capability::AdaptiveMunitions)
            {
                errors.push(ValidationError::machine(
                    ValidationCode::DialGating,
                    id,
                    "a DamageType Plan-B requires the Adaptive Munitions capability".to_string(),
                ));
            }

            // V8 — movement order feasible for the machine's mobility.
            let moving = !matches!(m.dials.movement, MovementMode::Hold);
            let immobile = matches!(stats.move_speed, None | Some(0));
            if moving && immobile {
                errors.push(ValidationError::machine(
                    ValidationCode::Movement,
                    id,
                    "an immobile / air-locked machine cannot take a movement order".to_string(),
                ));
            }
        }
        Err(e) => errors.push(structural_from_derivation(e, id)),
    }
}

fn check_mount(
    ruleset: &Ruleset,
    equip: &EquipmentId,
    mount: crate::model::types::MountClass,
    slot: &str,
    id: u8,
    errors: &mut Vec<ValidationError>,
) {
    let Some(module) = ruleset.equipment(equip) else {
        errors.push(ValidationError::machine(
            ValidationCode::Structural,
            id,
            format!("unknown {slot} '{}'", equip.as_str()),
        ));
        return;
    };
    let equip_mount = match &module.spec {
        EquipmentSpec::Weapon(w) => Some(w.mount_class),
        EquipmentSpec::Defense(d) => Some(d.mount_class),
        EquipmentSpec::Utility(_) => None, // utilities are ungated
    };
    match equip_mount {
        Some(em) if em != mount => errors.push(ValidationError::machine(
            ValidationCode::MountMismatch,
            id,
            format!(
                "{slot} '{}' is {em:?}-mount, machine is {mount:?}",
                equip.as_str()
            ),
        )),
        None => errors.push(ValidationError::machine(
            ValidationCode::MountMismatch,
            id,
            format!("{slot} slot holds a non-{slot} module '{}'", equip.as_str()),
        )),
        _ => {}
    }
}

fn validate_utilities(
    m: &MachineInstance,
    slots: SlotLayout,
    ruleset: &Ruleset,
    errors: &mut Vec<ValidationError>,
) {
    let id = m.instance_id;
    let utils = &m.loadout.utilities;
    // v3 US3-A economy: each utility costs a number of the chassis's utility *budget* (`slots.utility`);
    // a loadout is legal while the summed cost does not EXCEED the budget (under-spending is allowed).
    // Cost defaults to 1, so this reduces to the old "count == budget" for single-cost content except
    // that a partly-filled loadout is now legal (unspent slots are fine).
    let spent: u32 = utils
        .iter()
        .map(|u| match ruleset.equipment(u).map(|module| &module.spec) {
            Some(EquipmentSpec::Utility(spec)) => spec.cost as u32,
            _ => 0, // unknown / non-utility modules are reported below; they don't spend budget
        })
        .sum();
    // Modular Hardpoint (§14.3): each `ExtraUtilitySlot` utility raises the budget by 2. It costs 1
    // (counted in `spent`), so the net is a genuine +1 utility slot beyond the chassis default.
    let extra_slots: u32 = utils
        .iter()
        .filter(|u| match ruleset.equipment(u).map(|module| &module.spec) {
            Some(EquipmentSpec::Utility(spec)) => {
                spec.unlocks.contains(&Capability::ExtraUtilitySlot)
            }
            _ => false,
        })
        .count() as u32
        * 2;
    let budget = slots.utility as u32 + extra_slots;
    if spent > budget {
        errors.push(ValidationError::machine(
            ValidationCode::Utilities,
            id,
            format!("utilities cost {} of a {}-point utility budget", spent, budget),
        ));
    }
    // No duplicates (ordered scan → deterministic).
    for i in 0..utils.len() {
        for j in (i + 1)..utils.len() {
            if utils[i] == utils[j] {
                errors.push(ValidationError::machine(
                    ValidationCode::Utilities,
                    id,
                    format!("duplicate utility '{}'", utils[i].as_str()),
                ));
            }
        }
    }
    // Each utility must exist and be a Utility.
    for u in utils {
        match ruleset.equipment(u) {
            Some(module) if matches!(module.spec, EquipmentSpec::Utility(_)) => {}
            Some(_) => errors.push(ValidationError::machine(
                ValidationCode::Utilities,
                id,
                format!("'{}' is not a utility module", u.as_str()),
            )),
            None => errors.push(ValidationError::machine(
                ValidationCode::Structural,
                id,
                format!("unknown utility '{}'", u.as_str()),
            )),
        }
    }
}

fn structural_from_derivation(e: DerivationError, id: u8) -> ValidationError {
    ValidationError::machine(ValidationCode::Structural, id, format!("{e:?}"))
}

impl MachineInstance {
    /// The effective slot layout for this machine (variant override, else the type default).
    fn variant_slot_layout(&self, ruleset: &Ruleset) -> Option<SlotLayout> {
        ruleset
            .chassis
            .get(&self.variant_id)
            .and_then(|c| c.slot_layout_override)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::{seed_ruleset, stock_instance};
    use crate::model::types::{
        DamageType, DialKey, DialValue, EquipmentId, MachineTypeId, MovementMode, PlanBTrigger,
        Stance, TriggerCondition,
    };

    fn legal_army() -> Army {
        let rs = seed_ruleset();
        Army {
            machines: vec![
                stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
                stock_instance(&rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 1),
                stock_instance(&rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 2),
                stock_instance(&rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 3),
                stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 4),
            ],
        }
    }

    #[test]
    fn a_legal_army_validates() {
        let rs = seed_ruleset();
        assert_eq!(validate(&legal_army(), &rs), Ok(()));
    }

    #[test]
    fn v1_rejects_wrong_squad_size() {
        let rs = seed_ruleset();
        let mut army = legal_army();
        army.machines.pop();
        let errs = validate(&army, &rs).unwrap_err();
        assert!(errs.iter().any(|e| e.code == ValidationCode::SquadSize));
    }

    #[test]
    fn v2_rejects_zone_cap_breach() {
        let rs = seed_ruleset();
        let mut army = legal_army();
        // Pile four ground machines into Front (cap 3).
        army.machines[2].zone = ZoneId::Front;
        army.machines[4].zone = ZoneId::Front;
        let errs = validate(&army, &rs).unwrap_err();
        assert!(errs.iter().any(|e| e.code == ValidationCode::ZoneCap));
    }

    #[test]
    fn v3_rejects_off_home_zone() {
        let rs = seed_ruleset();
        let mut army = legal_army();
        army.machines[0].zone = ZoneId::Air; // a heavy tank in the air
        let errs = validate(&army, &rs).unwrap_err();
        assert!(errs
            .iter()
            .any(|e| e.code == ValidationCode::HomeZone && e.instance_id == Some(0)));
    }

    #[test]
    fn v4_rejects_mount_mismatch() {
        let rs = seed_ruleset();
        let mut army = legal_army();
        // Put a Light-mount autocannon on the heavy tank.
        army.machines[0].loadout.weapon = EquipmentId::new("Autocannon");
        let errs = validate(&army, &rs).unwrap_err();
        assert!(errs
            .iter()
            .any(|e| e.code == ValidationCode::MountMismatch && e.instance_id == Some(0)));
    }

    #[test]
    fn v5_rejects_duplicate_and_over_budget() {
        let rs = seed_ruleset();
        let mut army = legal_army();
        // Duplicate a utility → error (unchanged by the v3 economy).
        army.machines[0].loadout.utilities = vec![
            EquipmentId::new("FireControl"),
            EquipmentId::new("FireControl"),
            EquipmentId::new("Autoloader"),
        ];
        let errs = validate(&army, &rs).unwrap_err();
        assert!(errs
            .iter()
            .any(|e| e.code == ValidationCode::Utilities && e.instance_id == Some(0)));

        // Over budget (v3 US3-A): four cost-1 utilities exceed a 3-point utility budget → error.
        let mut army2 = legal_army();
        army2.machines[1].loadout.utilities = vec![
            EquipmentId::new("FireControl"),
            EquipmentId::new("DriveServos"),
            EquipmentId::new("Autoloader"),
            EquipmentId::new("ECMSuite"),
        ];
        assert!(validate(&army2, &rs)
            .unwrap_err()
            .iter()
            .any(|e| e.code == ValidationCode::Utilities));

        // Under budget is now LEGAL (v3 US3-A: unspent slots allowed) — this was an error under the
        // old exact-count rule.
        let mut army3 = legal_army();
        army3.machines[1].loadout.utilities = vec![EquipmentId::new("FireControl")];
        assert_eq!(
            validate(&army3, &rs),
            Ok(()),
            "under-spending the utility budget must be legal (US3-A)"
        );
    }

    #[test]
    fn v6_rejects_ungated_second_plan_b() {
        let rs = seed_ruleset();
        let mut army = legal_army();
        // Scout (no Combat AI) with two Plan-B triggers → only 1 slot available.
        army.machines[1].plan_b = vec![
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
        let errs = validate(&army, &rs).unwrap_err();
        assert!(errs
            .iter()
            .any(|e| e.code == ValidationCode::PlanB && e.instance_id == Some(1)));
    }

    /// A friendly Commander in the roster grants every ally the bonus Plan-B slot at declaration (US5):
    /// the exact Scout + Slot-2 trigger that `v6_rejects_ungated_second_plan_b` rejects becomes legal
    /// once a Commander is fielded (survival-gating of the *firing* happens at runtime, not here).
    #[test]
    fn v6_commander_grants_the_second_plan_b_slot() {
        let rs = seed_ruleset();
        let mut army = legal_army();
        // Field a Commander in place of the Artillery — still a legal 5-unit roster.
        army.machines[4] =
            stock_instance(&rs, MachineTypeId::Commander, "CommandPost", ZoneId::Rear, 4);
        // The same Scout + ungated Slot-2 the rejection test uses — now legal thanks to the Commander.
        army.machines[1].plan_b = vec![
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
        assert_eq!(
            validate(&army, &rs),
            Ok(()),
            "a Commander in the roster must grant the army a 2nd Plan-B slot"
        );
    }

    /// V7 (v3 US3): a DamageType Plan-B is legal only with the Adaptive Munitions capability. The stock
    /// Grizzly (no such utility) is rejected with `DialGating`; equipping Adaptive Munitions clears it.
    #[test]
    fn v7_gates_the_damage_type_plan_b_behind_adaptive_munitions() {
        let rs = seed_ruleset();
        let switch = PlanBTrigger {
            slot: PlanBSlot::Slot1,
            condition: TriggerCondition::AfterTick(0),
            dial: DialKey::DamageType,
            plan_b_value: DialValue::DamageType(DamageType::Energy),
        };

        // Ungated: the stock Grizzly carries no Adaptive Munitions → the DamageType Plan-B is rejected.
        let mut ungated = legal_army();
        ungated.machines[0].plan_b = vec![switch];
        let errs = validate(&ungated, &rs).unwrap_err();
        assert!(
            errs.iter()
                .any(|e| e.code == ValidationCode::DialGating && e.instance_id == Some(0)),
            "a DamageType Plan-B without Adaptive Munitions must be rejected (V7): {errs:?}"
        );

        // Gated: equip Adaptive Munitions on the same machine → the switch becomes legal.
        let mut gated = legal_army();
        gated.machines[0].loadout.utilities = vec![EquipmentId::new("AdaptiveMunitions")];
        gated.machines[0].plan_b = vec![switch];
        assert_eq!(
            validate(&gated, &rs),
            Ok(()),
            "Adaptive Munitions must unlock the DamageType Plan-B"
        );
    }

    #[test]
    fn v8_rejects_movement_order_on_air_locked() {
        let rs = seed_ruleset();
        let mut army = legal_army();
        // The heli (air-locked) with an Advance order.
        army.machines[3].dials.movement = MovementMode::Advance;
        let errs = validate(&army, &rs).unwrap_err();
        assert!(errs
            .iter()
            .any(|e| e.code == ValidationCode::Movement && e.instance_id == Some(3)));
    }

    #[test]
    fn errors_accumulate_across_rules() {
        let rs = seed_ruleset();
        let mut army = legal_army();
        army.machines.pop(); // V1
        army.machines[0].zone = ZoneId::Air; // V3
        let errs = validate(&army, &rs).unwrap_err();
        assert!(errs.iter().any(|e| e.code == ValidationCode::SquadSize));
        assert!(errs.iter().any(|e| e.code == ValidationCode::HomeZone));
    }
}
