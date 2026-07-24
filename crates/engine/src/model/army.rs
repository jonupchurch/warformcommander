//! Tier 1/3 bridge — configured [`MachineInstance`]s, the [`Army`], and the pure
//! **effective-stat derivation** (data-model → MachineInstance/Squad, T012).
//!
//! [`derive_effective_stats`] is the *shared* function the engine, Garage (Feature 4), and
//! balancer (Feature 2) all call (FR-007, P8) — the single place `baseStats ⊕ equipment ⊕
//! capability unlocks` is computed, so all three agree on what a build actually does.
//!
//! ## Derivation contract (a design decision worth stating — AGENTS rule 6)
//!
//! Equipment [`StatDeltas`] are **additive over the chassis [`BaseStats`]**, uniformly, with
//! two exceptions: `cadence_tier` and `reach` are **overrides** (a `Some` replaces the base),
//! and a weapon's `family` **replaces** the native family for damage-type + native-bonus
//! purposes. Additive-over-chassis is deliberate: a chassis's *per-shot damage* is its identity
//! (stat block §3 — "harder-hitting expressed as per-shot Dmg"), so the base weapon module is
//! the **identity** (zero deltas, native family) and a swapped weapon is expressed as a delta
//! *relative to that chassis*. Thus `Cavalier(40) + base = 40`, `Grizzly(35) + SiegeLaser(+5) =
//! 40` — the chassis edge is never erased by the gun. (The fixture, T014, converts the stat
//! block's std-variant weapon absolutes into these base-relative deltas.)

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::fixed::{Bp, Fixed, BP_ONE};
use crate::model::ruleset::Ruleset;
use crate::model::types::{
    BehaviorDials, CadenceTier, Capability, DamageFamily, DamageType, EquipmentId, EquipmentSpec,
    Loadout, MachineTypeId, MitigationMod, PlanBTrigger, ReachTag, SupportRange, VariantId, ZoneId,
};

/// A battle is 5v5 (FR-009, V1).
pub const SQUAD_SIZE: usize = 5;

/// A placed, fully-configured machine — the **pure config** the player builds. Effective stats
/// and power rating are **derived on demand** (not stored here), so the serialized input stays
/// canonical and derived data can never drift from it (a deliberate departure from the
/// data-model listing them as fields).
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineInstance {
    /// Stable index within the squad (0..5) — deterministic tie-break + replay identity.
    pub instance_id: u8,
    pub type_id: MachineTypeId,
    pub variant_id: VariantId,
    pub loadout: Loadout,
    pub dials: BehaviorDials,
    /// 0–2 Plan-B triggers (V6).
    #[serde(default)]
    pub plan_b: Vec<PlanBTrigger>,
    /// Assigned placement zone (within caps + home-zone eligibility, V2/V3).
    pub zone: ZoneId,
}

/// Exactly five [`MachineInstance`]s across the four zones — the unit the Garage saves and the
/// Arena runs. Structural legality (size, caps, home zones) is checked by `validate` (T030),
/// not here; this type is the container.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Army {
    pub machines: Vec<MachineInstance>,
}

impl Army {
    /// How many machines occupy each zone (ordered; for the V2 cap check + placement logic).
    pub fn zone_counts(&self) -> [(ZoneId, u8); 4] {
        let mut air = 0u8;
        let mut front = 0u8;
        let mut middle = 0u8;
        let mut rear = 0u8;
        for m in &self.machines {
            match m.zone {
                ZoneId::Air => air += 1,
                ZoneId::Front => front += 1,
                ZoneId::Middle => middle += 1,
                ZoneId::Rear => rear += 1,
            }
        }
        [
            (ZoneId::Air, air),
            (ZoneId::Front, front),
            (ZoneId::Middle, middle),
            (ZoneId::Rear, rear),
        ]
    }
}

/// The combat-ready stat block — the derived truth the tick loop reads. Integer/enum only.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveStats {
    // Survivability
    pub hull: Fixed,
    pub armor_pct: Bp,
    pub shield_cap: Fixed,
    pub shield_regen: Fixed,
    pub shield_delay: u16,
    /// v2 ablative pool — one-time, non-regenerating absorption between shields and hull. `ZERO` when
    /// no ablative defense is mounted (the overwhelmingly common case).
    pub ablative_cap: Fixed,
    /// Reactive plating (v2, Mech-exclusive): mitigation adapts toward the family absorbed most. `true`
    /// only for the reactive-plating defense; drives the reactive bias in `sim::damage`.
    pub reactive: bool,
    // Offense
    pub damage: Fixed,
    pub damage_type: DamageType,
    /// The equipped weapon's family (base weapon = native family).
    pub family: DamageFamily,
    /// `true` when `family` matches the machine type's native family (earns the native bonus).
    pub native_match: bool,
    pub cadence: CadenceTier,
    pub accuracy: Bp,
    pub crit_chance: Bp,
    pub crit_mult: Bp,
    pub splash: Bp,
    pub penetration: Bp,
    pub reach: ReachTag,
    /// Whether this machine can engage Air targets at all (AA weapon, Sensor Suite, or innate).
    pub can_target_air: bool,
    // Mobility
    /// `None` = air-locked (heli); `Some(0)` = immobile; `Some(n)` = mobile.
    pub move_speed: Option<u8>,
    pub evasion: Bp,
    pub threat: Fixed,
    /// Targeting draw offset (v3 US2, design §12.4): added to this machine's priority score in every
    /// enemy's chain — **Decoy/Taunt +2** pulls fire, **ECM −2** sheds it. `0` until an equipment module
    /// sets it (US3); the field is here now so the priority-score chain can read it uniformly.
    pub target_draw: i8,
    // Support
    pub support_power: Option<Fixed>,
    pub support_range: Option<SupportRange>,
    // Derived extras
    pub special_mitigation: Option<MitigationMod>,
    pub capabilities: BTreeSet<Capability>,
    /// 1 base, +1 with the Combat-AI capability (V6).
    pub plan_b_slots: u8,
}

/// Why a build could not be reduced to [`EffectiveStats`] — a *structural* fault (a referenced
/// id is absent, or a slot holds the wrong kind). Returned rather than panicking so the host can
/// surface it; the richer legality rules (V1–V8) are `validate`'s job (T030).
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum DerivationError {
    UnknownMachineType(MachineTypeId),
    UnknownVariant(VariantId),
    UnknownEquipment(EquipmentId),
    /// The slot referenced an equipment id of the wrong kind (e.g. a defense in the weapon slot).
    WrongSlotKind {
        id: EquipmentId,
        expected: SlotKind,
    },
}

/// Which equipment kind a slot expects (kept `Serialize`/`Deserialize`-friendly for the boundary).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum SlotKind {
    Weapon,
    Defense,
    Utility,
}

/// Internal additive accumulator — folds each module's [`StatDeltas`] in one place so the
/// derivation reads linearly instead of threading a dozen `&mut`s.
struct Accum {
    damage: Fixed,
    accuracy: Bp,
    evasion: Bp,
    armor_pct: Bp,
    crit_chance: Bp,
    splash: Bp,
    penetration: Bp,
    move_delta: i32,
    target_draw: i32,
    cadence: CadenceTier,
    reach: ReachTag,
}

impl Accum {
    /// Apply one module's deltas: additive everywhere; `cadence_tier`/`reach` override when `Some`.
    fn apply(&mut self, d: &crate::model::types::StatDeltas) {
        self.damage = self.damage.saturating_add(d.damage);
        self.accuracy += d.accuracy;
        self.evasion += d.evasion;
        self.armor_pct += d.armor_pct;
        self.crit_chance += d.crit_chance;
        self.splash += d.splash;
        self.penetration += d.penetration;
        self.move_delta += d.move_speed as i32;
        self.target_draw += d.target_draw as i32;
        if let Some(c) = d.cadence_tier {
            self.cadence = c;
        }
        if let Some(r) = d.reach {
            self.reach = r;
        }
    }
}

/// One reach step deeper (Rangefinder "+1 zone"). Reach tags are not a strict ladder, so this is
/// a documented first-pass bump: `Nearest → FrontMid → AnyGround`; others unchanged.
fn deepen(reach: ReachTag) -> ReachTag {
    match reach {
        ReachTag::Nearest => ReachTag::FrontMid,
        ReachTag::FrontMid => ReachTag::AnyGround,
        other => other,
    }
}

/// Derive a machine's combat-ready [`EffectiveStats`] from `type + variant + equipment` against
/// the [`Ruleset`] — the shared, pure derivation (FR-007). See the module docs for the additive
/// contract. Errors (rather than panics) on a structurally-broken build.
pub fn derive_effective_stats(
    machine: &MachineInstance,
    ruleset: &Ruleset,
) -> Result<EffectiveStats, DerivationError> {
    let base = ruleset
        .base_stats(&machine.variant_id)
        .ok_or_else(|| DerivationError::UnknownVariant(machine.variant_id.clone()))?;
    let mtype = ruleset
        .machine_type(machine.type_id)
        .ok_or(DerivationError::UnknownMachineType(machine.type_id))?;

    // Start every additive axis from the chassis base.
    let mut acc = Accum {
        damage: base.damage,
        accuracy: base.accuracy,
        evasion: base.evasion,
        armor_pct: base.armor_pct,
        crit_chance: base.crit_chance,
        splash: base.splash,
        penetration: base.penetration,
        move_delta: 0,
        target_draw: 0, // equipment-only (Decoy/ECM); no chassis carries an innate draw offset
        cadence: base.cadence,
        reach: base.reach,
    };
    let mut caps: BTreeSet<Capability> = BTreeSet::new();
    let mut cadence_shift: i32 = 0;

    // --- Weapon (defines the gun's family; deltas relative to the chassis) ---
    let weapon = lookup_weapon(ruleset, &machine.loadout.weapon)?;
    acc.apply(&weapon.stat_deltas);
    let family = weapon.family;

    // --- Defense (armor/shield/ablative layer + its tradeoff cost) ---
    // Defensive magnitudes scale by mount class (v2): the fragile back-rank mounts get less out of
    // the same slot, so lighting up their dead defense slot redistributes survivability rather than
    // inflating it. The scale is applied once, here, to every survivability grant — armor %, shield
    // pool, and ablative pool alike — so one mount-scale table tunes the whole defense system.
    let defense = lookup_defense(ruleset, &machine.loadout.defense)?;
    let scale = ruleset.mount_scale.for_mount(defense.mount_class);
    // Scale a bp armor delta by the (bp) mount factor: (delta × scale) / BP_ONE.
    acc.armor_pct += ((defense.armor_pct_delta as i128 * scale as i128) / BP_ONE as i128) as Bp;
    acc.apply(&defense.tradeoff);
    let (shield_cap, shield_regen, shield_delay) = match &defense.shield_delta {
        Some(s) => (
            base.shield_cap.saturating_add(s.cap.mul_bp(scale)),
            base.shield_regen.saturating_add(s.regen),
            (base.shield_delay as i32 + s.delay as i32).clamp(0, u16::MAX as i32) as u16,
        ),
        None => (base.shield_cap, base.shield_regen, base.shield_delay),
    };
    let ablative_cap = defense
        .ablative_delta
        .map(|a| a.cap.mul_bp(scale))
        .unwrap_or(Fixed::ZERO);
    let special_mitigation = defense.special_mitigation;
    let reactive = defense.reactive;

    // --- Utilities (additive deltas + capability unlocks + cadence shifts) ---
    for uid in &machine.loadout.utilities {
        let util = lookup_utility(ruleset, uid)?;
        if let Some(d) = &util.stat_deltas {
            acc.apply(d);
        }
        caps.extend(util.unlocks.iter().copied());
        cadence_shift += util.cadence_shift as i32;
    }

    // Native behavioural flexibility (v2, FR-025): the Mech — the sole generalist (`native_family ==
    // None`) — natively carries the extra Plan-B slot other chassis must buy with a Combat-AI utility.
    // It is the mechanical compensation for forfeiting the native-family weapon bonus (FR-027).
    if mtype.native_family.is_none() {
        caps.insert(Capability::ExtraPlanBSlot);
    }

    // v3 US1c: cadence is welded to the damage TYPE (design §D6), overriding the weapon's own tier —
    // Energy Fast / Kinetic Medium / Explosive Slow. Heavy-platform chassis (Heavy Tank, Mech) fire one
    // tier slower AND deal the heavy-platform damage bonus (ponderous but punchy); Artillery also fires
    // a tier slower (its Explosive → Siege) with no damage bonus. Support keeps its base (it projects,
    // not fires). Utility cadence shifts (Autoloader) still apply on top of the welded tier below.
    let cp = &ruleset.cadence_profile;
    if let Some(mut welded) = cp.tier_for(family) {
        let (slower, dmg_bonus) = match machine.type_id {
            MachineTypeId::HeavyTank | MachineTypeId::Mech => (true, cp.heavy_platform_dmg_bonus),
            MachineTypeId::Artillery => (true, 0),
            _ => (false, 0),
        };
        if slower {
            welded = welded.slower();
        }
        if dmg_bonus > 0 {
            acc.damage = acc.damage.mul_bp(BP_ONE + dmg_bonus);
        }
        acc.cadence = welded;
    }

    // Resolve cadence shifts (positive = faster, saturating at the tier ends).
    let mut cadence = acc.cadence;
    for _ in 0..cadence_shift.max(0) {
        cadence = cadence.faster();
    }
    for _ in 0..(-cadence_shift).max(0) {
        cadence = cadence.slower();
    }

    // Reach: Rangefinder deepens; splash caps; penetration/armor/evasion clamp to sane ranges.
    let reach = if caps.contains(&Capability::ExtendReach) {
        deepen(acc.reach)
    } else {
        acc.reach
    };
    let splash = acc.splash.clamp(0, ruleset.globals.splash_cap);
    let penetration = acc.penetration.clamp(0, BP_ONE);
    let armor_pct = acc.armor_pct.clamp(0, BP_ONE);
    let evasion = acc.evasion.clamp(0, BP_ONE);

    // Mobility: air-locked (base None) stays None; otherwise clamp the delta at zero.
    let move_speed = base
        .move_speed
        .map(|m| (m as i32 + acc.move_delta).clamp(0, u8::MAX as i32) as u8);

    let native_match = mtype.native_family == Some(family);
    let damage_type = family.as_damage_type().unwrap_or(base.damage_type);
    let can_target_air = mtype.air_capable_by_default
        || caps.contains(&Capability::TargetAir)
        || caps.contains(&Capability::AntiAir)
        || caps.contains(&Capability::RocketPack) // the Mech's Rocket Pack (v2, US4)
        || reach == ReachTag::Air
        // Energy weapons contest air (v2, staged US4) — but only when the ruleset enables the mechanic
        // (`energy_air_dmg_mult > 0`). Off by default, so this adds nothing to the pre-v2 field.
        || (family == DamageFamily::Energy && ruleset.air_mods.energy_air_dmg_mult > 0);
    let plan_b_slots = 1 + u8::from(caps.contains(&Capability::ExtraPlanBSlot));

    Ok(EffectiveStats {
        hull: base.hull,
        armor_pct,
        shield_cap,
        shield_regen,
        shield_delay,
        ablative_cap,
        reactive,
        damage: acc.damage.max_zero(),
        damage_type,
        family,
        native_match,
        cadence,
        accuracy: acc.accuracy,
        crit_chance: acc.crit_chance,
        crit_mult: base.crit_mult,
        splash,
        penetration,
        reach,
        can_target_air,
        move_speed,
        evasion,
        threat: base.threat,
        // Clamped to the ±2-per-source design range even if several draw modules stack (start-value).
        target_draw: acc.target_draw.clamp(i8::MIN as i32, i8::MAX as i32) as i8,
        support_power: base.support_power,
        support_range: base.support_range,
        special_mitigation,
        capabilities: caps,
        plan_b_slots,
    })
}

/// A coarse, **matchmaking-only** power rating (FR-006) — never touches combat math. A
/// deliberately simple first-pass sum; Feature 8 (matchmaking) owns the real formula.
pub fn power_rating(e: &EffectiveStats) -> Fixed {
    // survivability + a flat damage term (shots-per-second is folded in by the balancer, not here).
    e.hull.saturating_add(e.shield_cap).saturating_add(e.damage)
}

fn lookup_weapon<'r>(
    ruleset: &'r Ruleset,
    id: &EquipmentId,
) -> Result<&'r crate::model::types::WeaponSpec, DerivationError> {
    match ruleset.equipment(id) {
        Some(m) => match &m.spec {
            EquipmentSpec::Weapon(w) => Ok(w),
            _ => Err(DerivationError::WrongSlotKind {
                id: id.clone(),
                expected: SlotKind::Weapon,
            }),
        },
        None => Err(DerivationError::UnknownEquipment(id.clone())),
    }
}

fn lookup_defense<'r>(
    ruleset: &'r Ruleset,
    id: &EquipmentId,
) -> Result<&'r crate::model::types::DefenseSpec, DerivationError> {
    match ruleset.equipment(id) {
        Some(m) => match &m.spec {
            EquipmentSpec::Defense(d) => Ok(d),
            _ => Err(DerivationError::WrongSlotKind {
                id: id.clone(),
                expected: SlotKind::Defense,
            }),
        },
        None => Err(DerivationError::UnknownEquipment(id.clone())),
    }
}

fn lookup_utility<'r>(
    ruleset: &'r Ruleset,
    id: &EquipmentId,
) -> Result<&'r crate::model::types::UtilitySpec, DerivationError> {
    match ruleset.equipment(id) {
        Some(m) => match &m.spec {
            EquipmentSpec::Utility(u) => Ok(u),
            _ => Err(DerivationError::WrongSlotKind {
                id: id.clone(),
                expected: SlotKind::Utility,
            }),
        },
        None => Err(DerivationError::UnknownEquipment(id.clone())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ruleset::{
        AirModifiers, CadenceTicks, DamageMatrix, GlobalConstants, LayerMultipliers,
    };
    use crate::model::types::{
        BaseStats, BehaviorDials, ChassisVariant, DefenseSpec, EquipmentModule,
        MachineType, MountClass, MovementMode, ShieldDelta, SlotLayout, Stance, StatDeltas,
        TargetingChain, UtilitySpec, WeaponSpec,
    };
    use std::collections::BTreeMap;

    // A heavy tank with a Kinetic base weapon (dmg 35, Slow, Nearest) + a small equipment set.
    fn test_ruleset() -> Ruleset {
        let mut machine_types = BTreeMap::new();
        machine_types.insert(
            MachineTypeId::HeavyTank,
            MachineType {
                id: MachineTypeId::HeavyTank,
                native_family: Some(DamageFamily::Kinetic),
                home_zones: vec![ZoneId::Front, ZoneId::Middle, ZoneId::Rear],
                mount_class: MountClass::Heavy,
                slot_layout: SlotLayout::STANDARD,
                can_fire_from_rear: false,
                air_capable_by_default: false,
            },
        );

        let mut chassis = BTreeMap::new();
        chassis.insert(
            VariantId::new("Grizzly"),
            ChassisVariant {
                id: VariantId::new("Grizzly"),
                type_id: MachineTypeId::HeavyTank,
                slot_layout_override: None,
                passive_aura: None,
            },
        );

        let mut variants = BTreeMap::new();
        variants.insert(VariantId::new("Grizzly"), grizzly_base());

        let mut equipment = BTreeMap::new();
        // Base weapon: identity (Kinetic, 0 deltas, cadence/reach = base).
        equipment.insert(
            EquipmentId::new("HeavyCannon"),
            EquipmentModule {
                id: EquipmentId::new("HeavyCannon"),
                name: "Heavy Cannon".into(),
                spec: EquipmentSpec::Weapon(WeaponSpec {
                    mount_class: MountClass::Heavy,
                    family: DamageFamily::Kinetic,
                    stat_deltas: StatDeltas {
                        cadence_tier: Some(CadenceTier::Slow),
                        reach: Some(ReachTag::Nearest),
                        ..Default::default()
                    },
                }),
            },
        );
        // Off-family upgrade: Energy, +5 damage.
        equipment.insert(
            EquipmentId::new("SiegeLaser"),
            EquipmentModule {
                id: EquipmentId::new("SiegeLaser"),
                name: "Siege Laser".into(),
                spec: EquipmentSpec::Weapon(WeaponSpec {
                    mount_class: MountClass::Heavy,
                    family: DamageFamily::Energy,
                    stat_deltas: StatDeltas {
                        damage: Fixed::from_int(5),
                        cadence_tier: Some(CadenceTier::Slow),
                        reach: Some(ReachTag::Nearest),
                        ..Default::default()
                    },
                }),
            },
        );
        // Composite Armor: +12% armor, −1 move.
        equipment.insert(
            EquipmentId::new("CompositeArmor"),
            EquipmentModule {
                id: EquipmentId::new("CompositeArmor"),
                name: "Composite Armor".into(),
                spec: EquipmentSpec::Defense(DefenseSpec {
                    mount_class: MountClass::Heavy,
                    armor_pct_delta: 1_200,
                    shield_delta: None,
                    ablative_delta: None,
                    special_mitigation: None,
                    reactive: false,
                    tradeoff: StatDeltas {
                        move_speed: -1,
                        ..Default::default()
                    },
                }),
            },
        );
        // Deflector Shield: adds a 250/6/25 shield to a no-shield hull.
        equipment.insert(
            EquipmentId::new("DeflectorShield"),
            EquipmentModule {
                id: EquipmentId::new("DeflectorShield"),
                name: "Deflector Shield".into(),
                spec: EquipmentSpec::Defense(DefenseSpec {
                    mount_class: MountClass::Heavy,
                    armor_pct_delta: 0,
                    shield_delta: Some(ShieldDelta {
                        cap: Fixed::from_int(250),
                        regen: Fixed::from_int(6),
                        delay: 25,
                    }),
                    ablative_delta: None,
                    special_mitigation: None,
                    reactive: false,
                    tradeoff: StatDeltas::default(),
                }),
            },
        );
        // Autoloader: one cadence tier faster.
        equipment.insert(
            EquipmentId::new("Autoloader"),
            EquipmentModule {
                id: EquipmentId::new("Autoloader"),
                name: "Autoloader".into(),
                spec: EquipmentSpec::Utility(UtilitySpec {
                    stat_deltas: None,
                    unlocks: vec![],
                    cadence_shift: 1,
                    cost: 1,
                }),
            },
        );
        // Combat AI Core: +1 Plan-B slot.
        equipment.insert(
            EquipmentId::new("CombatAI"),
            EquipmentModule {
                id: EquipmentId::new("CombatAI"),
                name: "Combat AI Core".into(),
                spec: EquipmentSpec::Utility(UtilitySpec {
                    stat_deltas: None,
                    unlocks: vec![Capability::ExtraPlanBSlot],
                    cadence_shift: 0,
                    cost: 1,
                }),
            },
        );
        // Drive Servos: +2 move.
        equipment.insert(
            EquipmentId::new("DriveServos"),
            EquipmentModule {
                id: EquipmentId::new("DriveServos"),
                name: "Drive Servos".into(),
                spec: EquipmentSpec::Utility(UtilitySpec {
                    stat_deltas: Some(StatDeltas {
                        move_speed: 2,
                        ..Default::default()
                    }),
                    unlocks: vec![],
                    cadence_shift: 0,
                    cost: 1,
                }),
            },
        );

        Ruleset {
            machine_types,
            chassis,
            variants,
            equipment,
            damage_matrix: DamageMatrix {
                kinetic: LayerMultipliers {
                    vs_shields: 14_000,
                    vs_armor: 8_500,
                },
                energy: LayerMultipliers {
                    vs_shields: 6_000,
                    vs_armor: 12_500,
                },
                explosive: LayerMultipliers {
                    vs_shields: 10_000,
                    vs_armor: 10_000,
                },
            },
            cadence_ticks: CadenceTicks {
                fast: 1,
                medium: 3,
                slow: 5,
                siege: 10,
            },
            air_mods: AirModifiers {
                aa_acc_bonus: 1_000,
                aa_dmg_mult: 15_000,
                plink_acc_penalty: -2_500,
                plink_dmg_mult: 5_000,
                sam_ground_dmg_mult: 5_000,
                flak_dmg_mult: 10_000,
                aa_focus_per_air: 2,
                energy_air_dmg_mult: 0,
            },
            globals: GlobalConstants {
                tick_rate: 10,
                tick_cap: 1000,
                damage_variance: 500,
                crit_base_chance: 500,
                crit_base_mult: 15_000,
                native_bonus: 1_200,
                min_damage_floor: 1_000,
                splash_cap: 2_500,
                hit_clamp_min: 500,
                hit_clamp_max: 9_500,
            },
            role_damage_bonuses: BTreeMap::new(),
            ablative_mods: crate::model::ruleset::AblativeMods::default(),
            mount_scale: crate::model::ruleset::MountScale::default(),
            stance_mods: crate::model::ruleset::StanceMods::default(),
            reactive_mods: crate::model::ruleset::ReactiveMods::default(),
            coordination: crate::model::ruleset::Coordination::default(),
            cadence_profile: crate::model::ruleset::CadenceProfile::default(),
        }
    }

    fn grizzly_base() -> BaseStats {
        BaseStats {
            hull: Fixed::from_int(1700),
            armor_pct: 3_000,
            shield_cap: Fixed::ZERO,
            shield_regen: Fixed::ZERO,
            shield_delay: 0,
            damage: Fixed::from_int(35),
            damage_type: DamageType::Kinetic,
            cadence: CadenceTier::Slow,
            accuracy: 8_000,
            crit_chance: 500,
            crit_mult: 15_000,
            splash: 0,
            penetration: 0,
            reach: ReachTag::Nearest,
            move_speed: Some(2),
            evasion: 200,
            threat: Fixed::from_int(10),
            support_power: None,
            support_range: None,
        }
    }

    fn dials() -> BehaviorDials {
        BehaviorDials {
            targeting: TargetingChain::DEFAULT,
            movement: MovementMode::Advance,
            stance: Stance::Aggressive,
        }
    }

    fn instance(weapon: &str, defense: &str, utils: &[&str]) -> MachineInstance {
        MachineInstance {
            instance_id: 0,
            type_id: MachineTypeId::HeavyTank,
            variant_id: VariantId::new("Grizzly"),
            loadout: Loadout {
                weapon: EquipmentId::new(weapon),
                defense: EquipmentId::new(defense),
                utilities: utils.iter().map(|u| EquipmentId::new(*u)).collect(),
            },
            dials: dials(),
            plan_b: vec![],
            zone: ZoneId::Front,
        }
    }

    /// Base weapon = identity: effective damage/type/cadence equal the chassis base; native match.
    #[test]
    fn base_weapon_is_identity() {
        let rs = test_ruleset();
        let m = instance(
            "HeavyCannon",
            "CompositeArmor",
            &["Autoloader", "DriveServos", "CombatAI"],
        );
        let e = derive_effective_stats(&m, &rs).unwrap();
        // Base weapon adds no *weapon* delta; the Heavy chassis adds the +10% heavy-platform bonus (D6).
        assert_eq!(e.damage, Fixed::from_int(35).mul_bp(11_000), "base 35, +10% heavy platform");
        assert_eq!(e.damage_type, DamageType::Kinetic);
        assert!(
            e.native_match,
            "Kinetic weapon on Kinetic-native heavy matches"
        );
    }

    /// Off-family weapon: family/type flip, +5 damage, and the native bonus is lost.
    #[test]
    fn off_family_weapon_flips_type_and_drops_native_match() {
        let rs = test_ruleset();
        let m = instance(
            "SiegeLaser",
            "CompositeArmor",
            &["Autoloader", "DriveServos", "CombatAI"],
        );
        let e = derive_effective_stats(&m, &rs).unwrap();
        // 35 base + 5 weapon delta = 40, then the +10% heavy-platform bonus (D6).
        assert_eq!(e.damage, Fixed::from_int(40).mul_bp(11_000), "40, +10% heavy platform");
        assert_eq!(e.damage_type, DamageType::Energy);
        assert!(
            !e.native_match,
            "Energy weapon on Kinetic-native heavy does not match"
        );
    }

    /// Composite Armor adds armor% and pays −1 move; Autoloader shifts cadence Slow→Medium;
    /// Drive Servos +2 and the −1 tradeoff net to base+1; Combat AI grants a 2nd Plan-B slot.
    #[test]
    fn deltas_stack_across_slots() {
        let rs = test_ruleset();
        let m = instance(
            "HeavyCannon",
            "CompositeArmor",
            &["Autoloader", "DriveServos", "CombatAI"],
        );
        let e = derive_effective_stats(&m, &rs).unwrap();
        assert_eq!(e.armor_pct, 4_200, "30% base + 12% composite");
        assert_eq!(e.cadence, CadenceTier::Medium, "Autoloader: Slow → Medium");
        assert_eq!(e.move_speed, Some(3), "base 2, −1 composite, +2 servos");
        assert_eq!(e.plan_b_slots, 2, "Combat AI grants a 2nd slot");
        assert!(e.capabilities.contains(&Capability::ExtraPlanBSlot));
    }

    /// A shield defense establishes a shield on a hull that had none.
    #[test]
    fn shield_defense_adds_a_shield_pool() {
        let rs = test_ruleset();
        let m = instance(
            "HeavyCannon",
            "DeflectorShield",
            &["Autoloader", "DriveServos", "CombatAI"],
        );
        let e = derive_effective_stats(&m, &rs).unwrap();
        assert_eq!(e.shield_cap, Fixed::from_int(250));
        assert_eq!(e.shield_regen, Fixed::from_int(6));
        assert_eq!(e.shield_delay, 25);
        assert_eq!(
            e.armor_pct, 3_000,
            "no armor delta from a pure shield module"
        );
    }

    /// A missing equipment id is a typed error, not a panic; a wrong-kind slot is caught too.
    #[test]
    fn structural_faults_are_typed_errors() {
        let rs = test_ruleset();
        let missing = instance(
            "NoSuchGun",
            "CompositeArmor",
            &["Autoloader", "DriveServos", "CombatAI"],
        );
        assert_eq!(
            derive_effective_stats(&missing, &rs),
            Err(DerivationError::UnknownEquipment(EquipmentId::new(
                "NoSuchGun"
            )))
        );
        // A defense id in the weapon slot → WrongSlotKind.
        let swapped = instance("CompositeArmor", "CompositeArmor", &["Autoloader"]);
        assert!(matches!(
            derive_effective_stats(&swapped, &rs),
            Err(DerivationError::WrongSlotKind {
                expected: SlotKind::Weapon,
                ..
            })
        ));
    }

    /// Derivation is pure: same inputs → identical output (a determinism smoke check).
    #[test]
    fn derivation_is_deterministic() {
        let rs = test_ruleset();
        let m = instance(
            "SiegeLaser",
            "CompositeArmor",
            &["Autoloader", "DriveServos", "CombatAI"],
        );
        assert_eq!(
            derive_effective_stats(&m, &rs).unwrap(),
            derive_effective_stats(&m, &rs).unwrap()
        );
    }

    #[test]
    fn zone_counts_tally_placements() {
        let rs = test_ruleset();
        let _ = &rs;
        let mut a = instance("HeavyCannon", "CompositeArmor", &["Autoloader"]);
        a.zone = ZoneId::Front;
        let mut b = instance("HeavyCannon", "CompositeArmor", &["Autoloader"]);
        b.zone = ZoneId::Rear;
        let army = Army {
            machines: vec![a, b],
        };
        let counts = army.zone_counts();
        assert_eq!(counts[1], (ZoneId::Front, 1));
        assert_eq!(counts[3], (ZoneId::Rear, 1));
    }
}
