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
    Capability, EquipmentId, EquipmentSpec, MovementMode, PlanBSlot, SlotLayout,
    TargetRule, ZoneId,
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

    // V3–V8 — per machine.
    for m in &army.machines {
        validate_machine(m, ruleset, &mut errors);
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn validate_machine(m: &MachineInstance, ruleset: &Ruleset, errors: &mut Vec<ValidationError>) {
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
            // V6 — Plan-B count + Slot-2 gating.
            if m.plan_b.len() > stats.plan_b_slots as usize {
                errors.push(ValidationError::machine(
                    ValidationCode::PlanB,
                    id,
                    format!(
                        "{} Plan-B triggers exceed the {} available slots (Combat AI grants a 2nd)",
                        m.plan_b.len(),
                        stats.plan_b_slots
                    ),
                ));
            }
            if stats.plan_b_slots < 2 && m.plan_b.iter().any(|t| t.slot == PlanBSlot::Slot2) {
                errors.push(ValidationError::machine(
                    ValidationCode::PlanB,
                    id,
                    "a Slot-2 Plan-B trigger requires the Combat-AI capability".to_string(),
                ));
            }

            // V7 — capability-gated dial options.
            check_dial_gating(m, &stats.capabilities, id, errors);

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
    if utils.len() != slots.utility as usize {
        errors.push(ValidationError::machine(
            ValidationCode::Utilities,
            id,
            format!(
                "{} utilities equipped; the slot layout allows {}",
                utils.len(),
                slots.utility
            ),
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

/// Gate the dial options that have a defined unlocking capability (currently the Target-Air rule).
/// Options without a defined capability gate are allowed (the gating table is data-driven and grows
/// as capabilities are added).
fn check_dial_gating(
    m: &MachineInstance,
    caps: &std::collections::BTreeSet<Capability>,
    id: u8,
    errors: &mut Vec<ValidationError>,
) {
    let mut gate = |needs: Capability, ok: bool, what: &str| {
        if !ok && !caps.contains(&needs) {
            errors.push(ValidationError::machine(
                ValidationCode::DialGating,
                id,
                format!("dial option '{what}' requires the {needs:?} capability"),
            ));
        }
    };
    gate(
        Capability::TargetAir,
        m.dials.target_rule != TargetRule::TargetAir,
        "Target-Air rule",
    );
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
        DialKey, DialValue, EquipmentId, MachineTypeId, MovementMode, PlanBTrigger, Stance,
        TriggerCondition,
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
    fn v5_rejects_duplicate_and_wrong_count() {
        let rs = seed_ruleset();
        let mut army = legal_army();
        // Duplicate a utility.
        army.machines[0].loadout.utilities = vec![
            EquipmentId::new("FireControl"),
            EquipmentId::new("FireControl"),
            EquipmentId::new("Autoloader"),
        ];
        let errs = validate(&army, &rs).unwrap_err();
        assert!(errs
            .iter()
            .any(|e| e.code == ValidationCode::Utilities && e.instance_id == Some(0)));

        // Wrong count (too few).
        let mut army2 = legal_army();
        army2.machines[1].loadout.utilities = vec![EquipmentId::new("FireControl")];
        assert!(validate(&army2, &rs)
            .unwrap_err()
            .iter()
            .any(|e| e.code == ValidationCode::Utilities));
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

    #[test]
    fn v7_rejects_ungated_dial_option() {
        let rs = seed_ruleset();
        let mut army = legal_army();
        // Target-Air rule without the gating capability (no Sensor Suite equipped).
        army.machines[0].dials.target_rule = TargetRule::TargetAir;
        let errs = validate(&army, &rs).unwrap_err();
        assert!(errs
            .iter()
            .any(|e| e.code == ValidationCode::DialGating && e.instance_id == Some(0)));
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
