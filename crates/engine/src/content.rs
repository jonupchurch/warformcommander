//! Seed content — the representative [`Ruleset`] fixture (T014).
//!
//! The first-pass stat block ([`reference/warformcommander-firstpass-stats.md`]) rendered into
//! the typed model: **7 machine types × 3 variants** + a representative equipment catalog — enough
//! to run the engine and exercise the counter-web (spec Assumptions). A shared public
//! [`seed_ruleset`] (not a test-only fixture) so the balancer, examples, and tests all agree on
//! one canonical starting balance table. **Placeholder numbers** — the balancer tunes finals (P4).
//!
//! Weapon damage is expressed as a **delta over the chassis base** per the derivation contract
//! ([`crate::model::army`]): each type's base weapon is the identity (`+0`), so the chassis carries
//! its own per-shot damage (Grizzly 35, Cavalier 40) and a swapped weapon adds/subtracts from it.

use std::collections::BTreeMap;

use crate::fixed::Fixed;
use crate::model::army::MachineInstance;
use crate::model::ruleset::{
    AblativeMods, AirModifiers, CadenceTicks, Coordination, DamageMatrix, EmpowerMods,
    ExecuteMods, GlobalConstants, LayerMultipliers, MountScale, ReactiveMods, Ruleset, StanceAggro,
};
use crate::model::types::{
    AblativeDelta, AuraEffect, AuraKind, AuraScope, BaseStats, CadenceTier, Capability,
    ChassisVariant, DamageFamily, DamageType, DefenseSpec, EquipmentId, EquipmentModule,
    EquipmentSpec, Loadout, MachineType, MachineTypeId, MitigationMod, MountClass, ReachTag,
    ShieldDelta, SlotLayout, StatDeltas, SupportRange, VariantId, WeaponSpec,
};
use crate::model::types::{
    BehaviorDials, MovementMode, Stance, TargetRow, TargetRule, ZoneId,
};

/// Shorthand: a whole-unit [`Fixed`] quantity.
fn q(n: i64) -> Fixed {
    Fixed::from_int(n)
}

/// Build the canonical first-pass [`Ruleset`].
pub fn seed_ruleset() -> Ruleset {
    let mut machine_types = BTreeMap::new();
    let mut chassis = BTreeMap::new();
    let mut variants = BTreeMap::new();
    let mut equipment = BTreeMap::new();

    seed_machine_types(&mut machine_types);
    seed_variants(&mut chassis, &mut variants);
    seed_equipment(&mut equipment);

    Ruleset {
        machine_types,
        chassis,
        variants,
        equipment,
        // v3 sharpen (spec 015 US1, start-values to tune in the final sim pass): ×1.6 same-layer /
        // ×0.7 cross so the right damage type can overturn a rank gap. Explosive is the neutral middle.
        damage_matrix: DamageMatrix {
            kinetic: LayerMultipliers {
                vs_shields: 16_000, // ×1.6 shreds shields
                vs_armor: 7_000,    // ×0.7 folds to armor
            },
            energy: LayerMultipliers {
                vs_shields: 7_000, // ×0.7 bounces
                vs_armor: 16_000,  // ×1.6 melts armor
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
            aa_acc_bonus: 1_000,        // +0.10
            aa_dmg_mult: 15_000,        // ×1.5
            plink_acc_penalty: -2_500,  // −0.25
            plink_dmg_mult: 5_000,      // ×0.5  (non-AA vs air — dogfights)
            sam_ground_dmg_mult: 5_000, // ×0.5  (SAM vs ground — split from plink)
            flak_dmg_mult: 10_000,      // ×1.0  (flak vs air — full damage, no plink; default)
            aa_focus_per_air: 2, // AA attackers per enemy aircraft (fire discipline; default)
            energy_air_dmg_mult: 0, // OFF by default — energy weapons cannot contest air until re-seeded
        },
        globals: GlobalConstants {
            tick_rate: 10,
            tick_cap: 1000,
            damage_variance: 500,    // ±5%
            crit_base_chance: 500,   // 5%
            crit_base_mult: 15_000,  // ×1.5
            native_bonus: 1_200,     // +12%
            min_damage_floor: 1_000, // 10%
            splash_cap: 2_500,       // 25%
            hit_clamp_min: 500,      // 5%
            hit_clamp_max: 9_500,    // 95%
        },
        role_damage_bonuses: BTreeMap::new(),
        ablative_mods: AblativeMods::default(),
        mount_scale: MountScale::default(),
        stance_aggro: StanceAggro::default(),
        execute_mods: ExecuteMods::default(),
        empower_mods: EmpowerMods::default(),
        reactive_mods: ReactiveMods::default(),
        coordination: Coordination::default(),
    }
}

// ---------------------------------------------------------------------------
// Machine-type identities (§1/§2)
// ---------------------------------------------------------------------------

fn seed_machine_types(m: &mut BTreeMap<MachineTypeId, MachineType>) {
    let ground = || vec![ZoneId::Front, ZoneId::Middle, ZoneId::Rear];
    let insert = |m: &mut BTreeMap<_, _>, t: MachineType| {
        m.insert(t.id, t);
    };

    insert(
        m,
        MachineType {
            id: MachineTypeId::HeavyTank,
            native_family: Some(DamageFamily::Kinetic),
            home_zones: ground(),
            mount_class: MountClass::Heavy,
            slot_layout: SlotLayout::STANDARD,
            can_fire_from_rear: false,
            air_capable_by_default: false,
        },
    );
    insert(
        m,
        MachineType {
            id: MachineTypeId::LightTank,
            native_family: Some(DamageFamily::Kinetic),
            home_zones: ground(),
            mount_class: MountClass::Light,
            slot_layout: SlotLayout::STANDARD,
            can_fire_from_rear: false,
            air_capable_by_default: false,
        },
    );
    insert(
        m,
        MachineType {
            id: MachineTypeId::Mech,
            native_family: None, // generalist — no native bonus
            home_zones: ground(),
            mount_class: MountClass::Mech,
            slot_layout: SlotLayout::STANDARD,
            can_fire_from_rear: false,
            air_capable_by_default: false,
        },
    );
    insert(
        m,
        MachineType {
            id: MachineTypeId::AttackHeli,
            native_family: Some(DamageFamily::Explosive),
            home_zones: vec![ZoneId::Air], // air-locked
            mount_class: MountClass::Heli,
            slot_layout: SlotLayout::STANDARD,
            can_fire_from_rear: false,
            // A heli engages enemy air FIRST (air sorts frontmost, see sim/target.rs reach_zones) and
            // only at the non-AA "plink" rate (sim/damage.rs air_mods): it clears the skies, then turns
            // its guns on ground. With no enemy air present it bombs ground as normal.
            air_capable_by_default: true,
        },
    );
    insert(
        m,
        MachineType {
            id: MachineTypeId::RocketArtillery,
            native_family: Some(DamageFamily::Explosive),
            home_zones: ground(),
            mount_class: MountClass::RktArty,
            slot_layout: SlotLayout::STANDARD,
            can_fire_from_rear: true,
            air_capable_by_default: true, // the SAM specialist
        },
    );
    insert(
        m,
        MachineType {
            id: MachineTypeId::Artillery,
            native_family: Some(DamageFamily::Explosive),
            home_zones: ground(),
            mount_class: MountClass::Artillery,
            slot_layout: SlotLayout::STANDARD,
            can_fire_from_rear: true,
            air_capable_by_default: false, // indirect — never targets air
        },
    );
    insert(
        m,
        MachineType {
            id: MachineTypeId::RearSupport,
            native_family: Some(DamageFamily::Support),
            home_zones: ground(),
            mount_class: MountClass::Support,
            slot_layout: SlotLayout::STANDARD,
            can_fire_from_rear: false,
            air_capable_by_default: false,
        },
    );
}

// ---------------------------------------------------------------------------
// Variants (§2 std + §3 edges) — std base per type, variants via struct-update spread
// ---------------------------------------------------------------------------

fn seed_variants(
    chassis: &mut BTreeMap<VariantId, ChassisVariant>,
    variants: &mut BTreeMap<VariantId, BaseStats>,
) {
    let mut add = |name: &str,
                   type_id: MachineTypeId,
                   stats: BaseStats,
                   slot_override: Option<SlotLayout>,
                   aura: Option<AuraEffect>| {
        let id = VariantId::new(name);
        chassis.insert(
            id.clone(),
            ChassisVariant {
                id: id.clone(),
                type_id,
                slot_layout_override: slot_override,
                passive_aura: aura,
            },
        );
        variants.insert(id, stats);
    };

    // --- Heavy Tank (Kinetic · Slow · the wall) ---
    let grizzly = BaseStats {
        hull: q(1479),
        armor_pct: 3_000,
        shield_cap: Fixed::ZERO,
        shield_regen: Fixed::ZERO,
        shield_delay: 0,
        damage: q(35),
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
        threat: q(35),
        support_power: None,
        support_range: None,
    };
    add("Grizzly", MachineTypeId::HeavyTank, grizzly, None, None);
    add(
        "Cavalier",
        MachineTypeId::HeavyTank,
        BaseStats {
            hull: q(1183),
            armor_pct: 2_800,
            damage: q(40),
            move_speed: Some(4),
            evasion: 500,
            threat: q(40),
            ..grizzly
        },
        None,
        None,
    );
    add(
        "Bulwark",
        MachineTypeId::HeavyTank,
        BaseStats {
            hull: q(1849),
            armor_pct: 3_500,
            damage: q(26),
            move_speed: Some(1),
            threat: q(26),
            ..grizzly
        },
        None,
        Some(AuraEffect {
            kind: AuraKind::DamageDealt,
            magnitude: -800, // −8% to zone allies
            scope: AuraScope::ZoneAllies,
        }),
    );

    // --- Light Tank (Kinetic · Fast · skirmisher) ---
    let scout = BaseStats {
        hull: q(572),
        armor_pct: 600,
        shield_cap: Fixed::ZERO,
        shield_regen: Fixed::ZERO,
        shield_delay: 0,
        damage: q(5),
        damage_type: DamageType::Kinetic,
        cadence: CadenceTier::Fast,
        accuracy: 8_200,
        crit_chance: 500,
        crit_mult: 15_000,
        splash: 0,
        penetration: 0,
        reach: ReachTag::Nearest,
        move_speed: Some(6),
        evasion: 2_500,
        threat: q(5),
        support_power: None,
        support_range: None,
    };
    add("Scout", MachineTypeId::LightTank, scout, None, None);
    add(
        "Hunter",
        MachineTypeId::LightTank,
        BaseStats {
            accuracy: 9_000,
            evasion: 2_000,
            ..scout
        },
        None,
        None,
    );
    add(
        "Outrider",
        MachineTypeId::LightTank,
        BaseStats {
            hull: q(484),
            move_speed: Some(8),
            evasion: 2_800,
            ..scout
        },
        None,
        None,
    );

    // --- Mech (generalist · Medium · bruiser) ---
    let vanguard = BaseStats {
        hull: q(870),
        armor_pct: 1_200,
        shield_cap: Fixed::ZERO,
        shield_regen: Fixed::ZERO,
        shield_delay: 0,
        damage: q(15),
        damage_type: DamageType::Kinetic,
        cadence: CadenceTier::Medium,
        accuracy: 8_500,
        crit_chance: 500,
        crit_mult: 15_000,
        splash: 0,
        penetration: 0,
        reach: ReachTag::Nearest,
        move_speed: Some(5),
        evasion: 1_000,
        threat: q(15),
        support_power: None,
        support_range: None,
    };
    add("Vanguard", MachineTypeId::Mech, vanguard, None, None);
    add(
        "Striker",
        MachineTypeId::Mech,
        BaseStats {
            hull: q(713),
            damage: q(19),
            move_speed: Some(6),
            threat: q(19),
            ..vanguard
        },
        None,
        None,
    );
    add(
        "Sentinel",
        MachineTypeId::Mech,
        BaseStats {
            hull: q(1000),
            damage: q(12),
            threat: q(12),
            ..vanguard
        },
        Some(SlotLayout::FOUR_UTILITY),
        None,
    );

    // --- Attack Heli (Explosive · Medium · air-locked alpha) ---
    let gunship = BaseStats {
        hull: q(504),
        armor_pct: 400,
        shield_cap: Fixed::ZERO,
        shield_regen: Fixed::ZERO,
        shield_delay: 0,
        damage: q(17),
        damage_type: DamageType::Explosive,
        cadence: CadenceTier::Medium,
        accuracy: 8_000,
        crit_chance: 500,
        crit_mult: 15_000,
        splash: 1_500,
        penetration: 0,
        reach: ReachTag::AnyGround,
        move_speed: None, // air-locked
        evasion: 3_000,
        threat: q(17),
        support_power: None,
        support_range: None,
    };
    add("Gunship", MachineTypeId::AttackHeli, gunship, None, None);
    add(
        "Interceptor",
        MachineTypeId::AttackHeli,
        BaseStats {
            damage: q(14),
            evasion: 3_500,
            threat: q(14),
            ..gunship
        },
        None,
        None,
    );
    add(
        "Warhog",
        MachineTypeId::AttackHeli,
        BaseStats {
            hull: q(630),
            armor_pct: 600,
            damage: q(21),
            evasion: 2_200,
            threat: q(21),
            ..gunship
        },
        None,
        None,
    );

    // --- Rocket Artillery (Explosive · Slow · AA specialist) ---
    let sentry = BaseStats {
        hull: q(638),
        armor_pct: 1_000,
        shield_cap: Fixed::ZERO,
        shield_regen: Fixed::ZERO,
        shield_delay: 0,
        damage: q(30), // SAM
        damage_type: DamageType::Explosive,
        cadence: CadenceTier::Slow,
        accuracy: 8_500,
        crit_chance: 500,
        crit_mult: 15_000,
        splash: 2_000,
        penetration: 0,
        reach: ReachTag::Air, // primary weapon = SAM
        move_speed: Some(3),
        evasion: 600,
        threat: q(30),
        support_power: None,
        support_range: None,
    };
    add("Sentry", MachineTypeId::RocketArtillery, sentry, None, None);
    add(
        "Aegis",
        MachineTypeId::RocketArtillery,
        BaseStats {
            damage: q(36),
            threat: q(36),
            ..sentry
        },
        None,
        None,
    );
    add(
        "Deluge",
        MachineTypeId::RocketArtillery,
        BaseStats {
            damage: q(34),
            accuracy: 7_800,
            splash: 2_400,
            reach: ReachTag::AnyGround, // ground bombardment, weak AA
            threat: q(34),
            ..sentry
        },
        None,
        None,
    );

    // --- Artillery (Explosive · Siege · backline sniper, no air) ---
    let longbow = BaseStats {
        hull: q(527),
        armor_pct: 600,
        shield_cap: Fixed::ZERO,
        shield_regen: Fixed::ZERO,
        shield_delay: 0,
        damage: q(65),
        damage_type: DamageType::Explosive,
        cadence: CadenceTier::Siege,
        accuracy: 7_000,
        crit_chance: 500,
        crit_mult: 15_000,
        splash: 2_500,
        penetration: 0,
        reach: ReachTag::AnyGround,
        move_speed: Some(1),
        evasion: 300,
        threat: q(65),
        support_power: None,
        support_range: None,
    };
    add("Longbow", MachineTypeId::Artillery, longbow, None, None);
    add(
        "Siege",
        MachineTypeId::Artillery,
        BaseStats {
            hull: q(442),
            damage: q(82),
            threat: q(82),
            ..longbow
        },
        None,
        None,
    );
    add(
        "Marksman",
        MachineTypeId::Artillery,
        BaseStats {
            damage: q(58),
            accuracy: 8_500,
            splash: 1_000,
            threat: q(58),
            ..longbow
        },
        None,
        None,
    );

    // --- Rear Support (Support · Shields · force multiplier) ---
    let medic = BaseStats {
        hull: q(616),
        armor_pct: 1_200,
        shield_cap: q(250),
        shield_regen: q(6),
        shield_delay: 30,
        damage: Fixed::ZERO,              // no offense
        damage_type: DamageType::Kinetic, // placeholder; damage is 0
        cadence: CadenceTier::Medium,
        accuracy: 0,
        crit_chance: 0,
        crit_mult: 15_000,
        splash: 0,
        penetration: 0,
        reach: ReachTag::Nearest,
        move_speed: Some(3),
        evasion: 500,
        threat: q(5),
        support_power: Some(q(5)), // ~5 hull/tick to the most-wounded ally in range
        support_range: Some(SupportRange::WholeArmy), // heal the whole army, incl. the front line
    };
    add("Medic", MachineTypeId::RearSupport, medic, None, None);
    add(
        "Warden",
        MachineTypeId::RearSupport,
        BaseStats {
            hull: q(801),
            armor_pct: 1_800,
            support_range: Some(SupportRange::OwnZone),
            ..medic
        },
        None,
        None,
    );
    add(
        "CommandPost",
        MachineTypeId::RearSupport,
        BaseStats {
            hull: q(370),
            move_speed: Some(0), // immobile
            ..medic
        },
        Some(SlotLayout::FOUR_UTILITY),
        Some(AuraEffect {
            kind: AuraKind::CommandBoost,
            magnitude: 0,
            scope: AuraScope::ZoneAllies,
        }),
    );
}

// ---------------------------------------------------------------------------
// Equipment catalog (§4 representative subset)
// ---------------------------------------------------------------------------

fn weapon(mount: MountClass, family: DamageFamily, deltas: StatDeltas) -> EquipmentSpec {
    EquipmentSpec::Weapon(WeaponSpec {
        mount_class: mount,
        family,
        stat_deltas: deltas,
    })
}

fn defense(
    mount: MountClass,
    armor_delta: crate::fixed::Bp,
    shield: Option<ShieldDelta>,
    mitigation: Option<MitigationMod>,
    tradeoff: StatDeltas,
) -> EquipmentSpec {
    EquipmentSpec::Defense(DefenseSpec {
        mount_class: mount,
        armor_pct_delta: armor_delta,
        shield_delta: shield,
        ablative_delta: None,
        special_mitigation: mitigation,
        reactive: false,
        tradeoff,
    })
}

/// An ablative-family defense: a one-time, non-regenerating pool of `cap`, no armor/shield/tradeoff
/// (its drawback — never regenerating — is inherent). The pool magnitude scales by mount at derive.
fn defense_ablative(mount: MountClass, cap: crate::fixed::Fixed) -> EquipmentSpec {
    EquipmentSpec::Defense(DefenseSpec {
        mount_class: mount,
        armor_pct_delta: 0,
        shield_delta: None,
        ablative_delta: Some(AblativeDelta { cap }),
        special_mitigation: None,
        reactive: false,
        tradeoff: StatDeltas::default(),
    })
}

/// **Reactive plating** (v2, Mech-exclusive): the same armour + shield as the Balanced module, plus the
/// `reactive` flag that makes mitigation adapt toward the family that has hit hardest. It starts exactly
/// as Balanced (nothing absorbed yet), so it is never worse at battle start (FR-024).
fn defense_reactive(
    mount: MountClass,
    armor_delta: crate::fixed::Bp,
    shield: ShieldDelta,
) -> EquipmentSpec {
    EquipmentSpec::Defense(DefenseSpec {
        mount_class: mount,
        armor_pct_delta: armor_delta,
        shield_delta: Some(shield),
        ablative_delta: None,
        special_mitigation: None,
        reactive: true,
        tradeoff: StatDeltas::default(),
    })
}

/// The id stem for a mount's generated defense modules (`{stem}Armor`, `{stem}Shield`, …).
fn mount_suffix(mount: MountClass) -> &'static str {
    match mount {
        MountClass::Heavy => "Heavy",
        MountClass::Light => "Light",
        MountClass::Mech => "Mech",
        MountClass::Heli => "Heli",
        MountClass::RktArty => "RktArty",
        MountClass::Artillery => "Artillery",
        MountClass::Support => "Support",
    }
}

fn seed_equipment(e: &mut BTreeMap<EquipmentId, EquipmentModule>) {
    let mut add = |id: &str, name: &str, spec: EquipmentSpec| {
        e.insert(
            EquipmentId::new(id),
            EquipmentModule {
                id: EquipmentId::new(id),
                name: name.into(),
                spec,
            },
        );
    };

    // Convenience: a weapon whose only deltas are its cadence + reach (a base/identity gun).
    let gun = |cadence: CadenceTier, reach: ReachTag| StatDeltas {
        cadence_tier: Some(cadence),
        reach: Some(reach),
        ..Default::default()
    };

    // --- Weapons (deltas relative to the mount's std chassis) ---
    add(
        "HeavyCannon",
        "Heavy Cannon",
        weapon(
            MountClass::Heavy,
            DamageFamily::Kinetic,
            gun(CadenceTier::Slow, ReachTag::Nearest),
        ),
    );
    add(
        "SiegeLaser",
        "Siege Laser",
        weapon(
            MountClass::Heavy,
            DamageFamily::Energy,
            StatDeltas {
                damage: q(5), // 35 → 40, off-family (melts armor)
                cadence_tier: Some(CadenceTier::Slow),
                reach: Some(ReachTag::Nearest),
                ..Default::default()
            },
        ),
    );
    add(
        "Railgun",
        "Railgun",
        weapon(
            MountClass::Heavy,
            DamageFamily::Kinetic,
            StatDeltas {
                damage: q(25),      // 35 → 60
                penetration: 5_000, // pierces 50% of shields
                cadence_tier: Some(CadenceTier::Siege),
                reach: Some(ReachTag::Deep),
                ..Default::default()
            },
        ),
    );
    add(
        "Autocannon",
        "Autocannon",
        weapon(
            MountClass::Light,
            DamageFamily::Kinetic,
            gun(CadenceTier::Fast, ReachTag::Nearest),
        ),
    );
    add(
        "GaussRepeater",
        "Gauss Repeater",
        weapon(
            MountClass::Light,
            DamageFamily::Kinetic,
            StatDeltas {
                damage: q(-1), // 5 → 4, shield-shred flavor
                cadence_tier: Some(CadenceTier::Fast),
                reach: Some(ReachTag::Nearest),
                ..Default::default()
            },
        ),
    );
    add(
        "AssaultCannon",
        "Assault Cannon",
        weapon(
            MountClass::Mech,
            DamageFamily::Kinetic,
            gun(CadenceTier::Medium, ReachTag::Nearest),
        ),
    );
    add(
        "PulseLaser",
        "Pulse Laser",
        weapon(
            MountClass::Mech,
            DamageFamily::Energy,
            gun(CadenceTier::Medium, ReachTag::Nearest),
        ),
    );
    add(
        "RocketPods",
        "Rocket Pods",
        weapon(
            MountClass::Heli,
            DamageFamily::Explosive,
            gun(CadenceTier::Medium, ReachTag::AnyGround),
        ),
    );
    add(
        "SAMBattery",
        "SAM Battery",
        weapon(
            MountClass::RktArty,
            DamageFamily::Explosive,
            gun(CadenceTier::Slow, ReachTag::Air),
        ),
    );
    add(
        "RocketBarrage",
        "Rocket Barrage",
        weapon(
            MountClass::RktArty,
            DamageFamily::Explosive,
            gun(CadenceTier::Slow, ReachTag::AnyGround),
        ),
    );
    add(
        "Howitzer",
        "Howitzer",
        weapon(
            MountClass::Artillery,
            DamageFamily::Explosive,
            gun(CadenceTier::Siege, ReachTag::AnyGround),
        ),
    );
    add(
        "RepairBeam",
        "Repair Beam",
        weapon(
            MountClass::Support,
            DamageFamily::Support,
            gun(CadenceTier::Medium, ReachTag::Nearest),
        ),
    );

    // --- Defenses: four families per mount, generated from one scale loop (v2) ---
    // The per-mount magnitude scaling happens at *derive* time (`mount_scale`), so every mount shares
    // these base numbers and the scale table alone differentiates a fragile heli from a heavy tank —
    // one table tunes the whole system (FR-009). The default slot is the Balanced module
    // (`base_defense_id`), which — unlike the old no-op "Standard Hull" — grants a modest mix of armor
    // and shield with no drawback. The four families fail to *different* threats (research R1/R2):
    // Armor to Energy + the min-floor, Shield to penetration + Energy, Ablative to attrition alone.
    for mount in [
        MountClass::Heavy,
        MountClass::Light,
        MountClass::Mech,
        MountClass::Heli,
        MountClass::RktArty,
        MountClass::Artillery,
        MountClass::Support,
    ] {
        let suffix = mount_suffix(mount);
        // Balanced (default). Keeps the `StandardHull*` id stable across the v1→v2 transition — every
        // stock build, seed army, and fixture already references it — while replacing its dead no-op
        // with a real, if unremarkable, defense: modest armor + a small shield, no cost.
        add(
            base_defense_id(mount),
            "Balanced",
            defense(
                mount,
                500,
                Some(ShieldDelta {
                    cap: q(150),
                    regen: q(5),
                    delay: 25,
                }),
                None,
                StatDeltas::default(),
            ),
        );
        // Armor — permanent, matrix-agnostic hull mitigation, paid for in mobility.
        add(
            &format!("{suffix}Armor"),
            "Armor Plating",
            defense(
                mount,
                2_000,
                None,
                None,
                StatDeltas {
                    move_speed: -1,
                    ..Default::default()
                },
            ),
        );
        // Shield — a regenerating pool; strong against sustained chip, bypassed by penetration.
        add(
            &format!("{suffix}Shield"),
            "Shield Array",
            defense(
                mount,
                0,
                Some(ShieldDelta {
                    cap: q(450),
                    regen: q(12),
                    delay: 16,
                }),
                None,
                StatDeltas::default(),
            ),
        );
        // Ablative — a large one-time pool that never regenerates; front-loaded, indifferent to
        // damage family, vulnerable only to attrition. The 20% save makes it ~1.25× its face value.
        add(
            &format!("{suffix}Ablative"),
            "Ablative Plating",
            defense_ablative(mount, q(600)),
        );
        // Reactive plating (v2) — Mech-exclusive fifth option (FR-023). Same armour + shield as
        // Balanced, so it opens identical and is never worse at battle start (FR-024); the `reactive`
        // flag makes its mitigation adapt toward whatever family has hit it hardest. Mount-gated, so no
        // other chassis can equip it (scenario 5) — the mount check enforces exclusivity for free.
        if mount == MountClass::Mech {
            add(
                &format!("{suffix}Reactive"),
                "Reactive Plating",
                defense_reactive(
                    mount,
                    500,
                    ShieldDelta {
                        cap: q(150),
                        regen: q(5),
                        delay: 25,
                    },
                ),
            );
        }
    }

    // --- Defenses: the specials (§4) ---
    add(
        "CompositeArmor",
        "Composite Armor",
        defense(
            MountClass::Heavy,
            1_200, // +12%
            None,
            None,
            StatDeltas {
                move_speed: -1,
                ..Default::default()
            },
        ),
    );
    add(
        "DeflectorShield",
        "Deflector Shield",
        defense(
            MountClass::Heavy,
            0,
            Some(ShieldDelta {
                cap: q(250),
                regen: q(6),
                delay: 25,
            }),
            None,
            StatDeltas::default(),
        ),
    );
    add(
        "BlastPlating",
        "Blast Plating",
        defense(
            MountClass::Heavy,
            800, // +8%
            None,
            Some(MitigationMod {
                against: DamageType::Explosive,
                splash_taken_mult: 6_000, // −40% explosive splash taken
            }),
            StatDeltas::default(),
        ),
    );
    add(
        "FastCycleShield",
        "Fast-Cycle Shield",
        defense(
            MountClass::Light,
            0,
            Some(ShieldDelta {
                cap: q(120),
                regen: q(12),
                delay: 12,
            }),
            None,
            StatDeltas::default(),
        ),
    );

    // --- Utilities (ungated) ---
    add(
        "Autoloader",
        "Autoloader",
        EquipmentSpec::Utility(crate::model::types::UtilitySpec {
            stat_deltas: None,
            unlocks: vec![],
            cadence_shift: 1,
        }),
    );
    add(
        "FireControl",
        "Fire Control",
        util_deltas(StatDeltas {
            accuracy: 800, // +0.08 vs evasive (modeled as flat here)
            ..Default::default()
        }),
    );
    add(
        "DriveServos",
        "Drive Servos",
        util_deltas(StatDeltas {
            move_speed: 2,
            ..Default::default()
        }),
    );
    add(
        "ECMSuite",
        "ECM Suite",
        // ECM lowers *attacker* accuracy at combat time (an aura we don't yet model); the seed
        // stands in with a small self-evasion bump so it is a meaningful, legal utility.
        util_deltas(StatDeltas {
            evasion: 500,
            ..Default::default()
        }),
    );
    add(
        "CombatAI",
        "Combat AI Core",
        EquipmentSpec::Utility(crate::model::types::UtilitySpec {
            stat_deltas: None,
            unlocks: vec![
                Capability::ExtraPlanBSlot,
                Capability::OpportunistStance,
            ],
            cadence_shift: 0,
        }),
    );
    add(
        "SensorSuite",
        "Sensor Suite",
        EquipmentSpec::Utility(crate::model::types::UtilitySpec {
            stat_deltas: None,
            unlocks: vec![Capability::TargetAir],
            cadence_shift: 0,
        }),
    );
    add(
        "Rangefinder",
        "Rangefinder",
        EquipmentSpec::Utility(crate::model::types::UtilitySpec {
            stat_deltas: None,
            unlocks: vec![Capability::ExtendReach],
            cadence_shift: 0,
        }),
    );
    // Rocket Pack (v2, US4): the Mech's air answer — full-rate anti-air (flak damage), but reach-limited
    // to the front line so dedicated AA keeps its whole-field reach advantage (FR-026/029). A utility, so
    // it costs a slot; a Mech that wants to answer aircraft trades a utility for the capability.
    add(
        "RocketPack",
        "Rocket Pack",
        EquipmentSpec::Utility(crate::model::types::UtilitySpec {
            stat_deltas: None,
            unlocks: vec![Capability::RocketPack],
            cadence_shift: 0,
        }),
    );
}

fn util_deltas(d: StatDeltas) -> EquipmentSpec {
    EquipmentSpec::Utility(crate::model::types::UtilitySpec {
        stat_deltas: Some(d),
        unlocks: vec![],
        cadence_shift: 0,
    })
}

/// The base/identity defense id for a mount class.
fn base_defense_id(mount: MountClass) -> &'static str {
    match mount {
        MountClass::Heavy => "StandardHullHeavy",
        MountClass::Light => "StandardHullLight",
        MountClass::Mech => "StandardHullMech",
        MountClass::Heli => "StandardHullHeli",
        MountClass::RktArty => "StandardHullRktArty",
        MountClass::Artillery => "StandardHullArtillery",
        MountClass::Support => "StandardHullSupport",
    }
}

// ---------------------------------------------------------------------------
// Stock-build helpers (for tests, examples, US1)
// ---------------------------------------------------------------------------

/// The base weapon id + mount for a machine type (its native/default gun).
fn base_weapon_for(type_id: MachineTypeId, variant: &VariantId) -> (&'static str, MountClass) {
    match type_id {
        MachineTypeId::HeavyTank => ("HeavyCannon", MountClass::Heavy),
        MachineTypeId::LightTank => ("Autocannon", MountClass::Light),
        MachineTypeId::Mech => ("AssaultCannon", MountClass::Mech),
        MachineTypeId::AttackHeli => ("RocketPods", MountClass::Heli),
        MachineTypeId::RocketArtillery => {
            // Deluge's identity is the ground barrage; the others carry the SAM.
            if variant.as_str() == "Deluge" {
                ("RocketBarrage", MountClass::RktArty)
            } else {
                ("SAMBattery", MountClass::RktArty)
            }
        }
        MachineTypeId::Artillery => ("Howitzer", MountClass::Artillery),
        MachineTypeId::RearSupport => ("RepairBeam", MountClass::Support),
    }
}

/// Default behavior dials (all starter options) — the stock setup.
pub fn stock_dials() -> BehaviorDials {
    BehaviorDials {
        target_row: TargetRow::FrontReachable,
        target_rule: TargetRule::FocusFire,
        movement: MovementMode::Hold,
        stance: Stance::Neutral,
    }
}

/// A legal stock [`MachineInstance`] for a type/variant: base weapon + base-hull defense + as many
/// ungated utilities as the slot layout allows, default dials, no Plan-B. Panics if the variant is
/// unknown — callers pass ids from this module's own catalog.
pub fn stock_instance(
    ruleset: &Ruleset,
    type_id: MachineTypeId,
    variant: &str,
    zone: ZoneId,
    instance_id: u8,
) -> MachineInstance {
    let variant_id = VariantId::new(variant);
    let (weapon_id, mount) = base_weapon_for(type_id, &variant_id);

    // Utility slot count = the variant's override, else the type's default.
    let util_slots = ruleset
        .chassis
        .get(&variant_id)
        .and_then(|c| c.slot_layout_override)
        .or_else(|| ruleset.machine_type(type_id).map(|t| t.slot_layout))
        .map(|s| s.utility)
        .unwrap_or(3) as usize;

    let pool = ["FireControl", "DriveServos", "Autoloader", "ECMSuite"];
    let utilities: Vec<EquipmentId> = pool
        .iter()
        .take(util_slots)
        .map(|u| EquipmentId::new(*u))
        .collect();

    MachineInstance {
        instance_id,
        type_id,
        variant_id,
        loadout: Loadout {
            weapon: EquipmentId::new(weapon_id),
            defense: EquipmentId::new(base_defense_id(mount)),
            utilities,
        },
        dials: stock_dials(),
        plan_b: vec![],
        zone,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::army::derive_effective_stats;

    #[test]
    fn seed_has_all_types_and_variants() {
        let rs = seed_ruleset();
        assert_eq!(rs.machine_types.len(), 7, "seven machine types");
        assert_eq!(rs.variants.len(), 21, "7 types × 3 variants");
        assert_eq!(rs.chassis.len(), 21);
    }

    #[test]
    fn spot_check_stat_block_numbers() {
        let rs = seed_ruleset();
        // Hull values are the v2 rebase (spec 013/US1): chassis hull was cut ~13% so that lighting up
        // the previously-dead defense slot (the new Balanced default grants armor + a shield)
        // redistributes survivability rather than inflating it — median battle duration stays within
        // 10% of the v11 baseline. See specs/013-v2-ruleset/baseline/comparison-points.md.
        assert_eq!(
            rs.base_stats(&VariantId::new("Grizzly")).unwrap().hull,
            q(1479)
        );
        assert_eq!(
            rs.base_stats(&VariantId::new("Bulwark")).unwrap().hull,
            q(1849)
        );
        assert_eq!(
            rs.base_stats(&VariantId::new("Siege")).unwrap().damage,
            q(82)
        );
        // Bulwark's damage aura is present.
        assert!(rs.chassis[&VariantId::new("Bulwark")]
            .passive_aura
            .is_some());
    }

    /// Every variant's stock build derives to legal effective stats without error — proves the
    /// catalog is internally consistent (every variant has a mount-legal base weapon + defense).
    #[test]
    fn every_variant_has_a_derivable_stock_build() {
        let rs = seed_ruleset();
        let cases: Vec<(MachineTypeId, &str)> = vec![
            (MachineTypeId::HeavyTank, "Grizzly"),
            (MachineTypeId::HeavyTank, "Cavalier"),
            (MachineTypeId::HeavyTank, "Bulwark"),
            (MachineTypeId::LightTank, "Scout"),
            (MachineTypeId::LightTank, "Hunter"),
            (MachineTypeId::LightTank, "Outrider"),
            (MachineTypeId::Mech, "Vanguard"),
            (MachineTypeId::Mech, "Striker"),
            (MachineTypeId::Mech, "Sentinel"),
            (MachineTypeId::AttackHeli, "Gunship"),
            (MachineTypeId::AttackHeli, "Interceptor"),
            (MachineTypeId::AttackHeli, "Warhog"),
            (MachineTypeId::RocketArtillery, "Sentry"),
            (MachineTypeId::RocketArtillery, "Aegis"),
            (MachineTypeId::RocketArtillery, "Deluge"),
            (MachineTypeId::Artillery, "Longbow"),
            (MachineTypeId::Artillery, "Siege"),
            (MachineTypeId::Artillery, "Marksman"),
            (MachineTypeId::RearSupport, "Medic"),
            (MachineTypeId::RearSupport, "Warden"),
            (MachineTypeId::RearSupport, "CommandPost"),
        ];
        assert_eq!(cases.len(), 21);
        for (type_id, variant) in cases {
            let zone = if type_id == MachineTypeId::AttackHeli {
                ZoneId::Air
            } else {
                ZoneId::Front
            };
            let m = stock_instance(&rs, type_id, variant, zone, 0);
            let e = derive_effective_stats(&m, &rs)
                .unwrap_or_else(|err| panic!("{variant} stock build failed: {err:?}"));
            // Sanity: a 4-utility variant actually gets 4 utilities.
            let expected_utils = if matches!(variant, "Sentinel" | "CommandPost") {
                4
            } else {
                3
            };
            assert_eq!(
                m.loadout.utilities.len(),
                expected_utils,
                "{variant} utility count"
            );
            // Air-locked helis keep move_speed None through derivation.
            if type_id == MachineTypeId::AttackHeli {
                assert_eq!(e.move_speed, None, "heli stays air-locked");
            }
        }
    }

    /// The counter-web hooks: a heavy with the base Kinetic gun matches native; swapping to the
    /// Siege Laser flips to Energy and drops the native bonus.
    #[test]
    fn heavy_weapon_swap_changes_family_and_native_match() {
        let rs = seed_ruleset();
        let mut m = stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0);
        let base = derive_effective_stats(&m, &rs).unwrap();
        assert_eq!(base.damage_type, DamageType::Kinetic);
        assert!(base.native_match);

        m.loadout.weapon = EquipmentId::new("SiegeLaser");
        let laser = derive_effective_stats(&m, &rs).unwrap();
        assert_eq!(laser.damage_type, DamageType::Energy);
        assert_eq!(laser.damage, q(40), "35 base + 5 laser delta");
        assert!(!laser.native_match);
    }

    #[test]
    fn ruleset_hash_is_stable_across_two_builds() {
        // Two independent constructions of the seed hash identically (canonical + deterministic).
        assert_eq!(seed_ruleset().hash(), seed_ruleset().hash());
    }
}
