//! Tier 2 — the Ruleset, i.e. the balance table (data-model Tier 2, T011).
//!
//! **Every tunable number** the engine reads, passed into `resolve(...)` as data — the
//! engine hard-codes *none* of it (FR-007). Admin-editable live (Feature 12); un-versioned
//! at rest (safe: recorded replays never re-derive from it, they persist their own inputs).
//!
//! It is also the engine's **content catalog**: the [`MachineType`] identities, the
//! [`ChassisVariant`] identities, the per-variant [`BaseStats`], and the [`EquipmentModule`]
//! catalog all live here keyed by id, so `resolve` can look up everything an [`Army`] refers
//! to by id. Maps are [`BTreeMap`] (ordered iteration → deterministic; research A4), **never
//! `HashMap`**.
//!
//! [`Army`]: crate::model::army

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::fixed::Bp;
use crate::model::types::{
    BaseStats, CadenceTier, ChassisVariant, DamageType, EquipmentId, EquipmentModule, MachineType,
    MachineTypeId, VariantId,
};

/// A stable, portable digest of a [`Ruleset`] (BLAKE3 hex). Stamped into each Replay/Result
/// for **provenance/debugging only** — never used to re-derive a recorded battle.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
#[serde(transparent)]
pub struct RulesetHash(pub String);

/// The balance table + content catalog — the engine's sole data input beyond the armies + seed.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ruleset {
    /// The seven machine-type identities (home zones, mount class, rear-fire, air-capable).
    pub machine_types: BTreeMap<MachineTypeId, MachineType>,
    /// Per-variant identity (parent type, slot override, passive aura).
    pub chassis: BTreeMap<VariantId, ChassisVariant>,
    /// Per-variant base stat block — *the* tunable numbers (data-model naming: `variants`).
    pub variants: BTreeMap<VariantId, BaseStats>,
    /// The equipment catalog with all deltas.
    pub equipment: BTreeMap<EquipmentId, EquipmentModule>,
    /// Damage-type × defense-layer multipliers (the §6 counter-web matrix).
    pub damage_matrix: DamageMatrix,
    /// Ticks-per-shot for each cadence tier.
    pub cadence_ticks: CadenceTicks,
    /// Air combat modifiers (AA bonus, direct-fire plink penalty).
    pub air_mods: AirModifiers,
    /// Tick constants + the global combat coefficients.
    pub globals: GlobalConstants,
}

impl Ruleset {
    /// Look up a variant's base stats by id.
    pub fn base_stats(&self, variant: &VariantId) -> Option<&BaseStats> {
        self.variants.get(variant)
    }

    /// Look up a machine-type identity by id.
    pub fn machine_type(&self, id: MachineTypeId) -> Option<&MachineType> {
        self.machine_types.get(&id)
    }

    /// Look up an equipment module by id.
    pub fn equipment(&self, id: &EquipmentId) -> Option<&EquipmentModule> {
        self.equipment.get(id)
    }

    /// A stable, portable [`RulesetHash`]: canonical JSON (ordered `BTreeMap` keys + fixed
    /// struct field order → one byte string) fed to BLAKE3. Identical on native and wasm32
    /// (P6); recomputing it any number of times yields the same digest (research A5).
    pub fn hash(&self) -> RulesetHash {
        // serde_json over an all-integer, BTreeMap-keyed structure is canonical: sorted keys,
        // fixed field order, no float formatting. `to_vec` cannot fail for this type.
        let bytes = serde_json::to_vec(self).expect("Ruleset is always serializable");
        RulesetHash(blake3::hash(&bytes).to_hex().to_string())
    }
}

/// The damage-type × defense-layer multiplier table (bp). The counter-web's core (stat block §1).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DamageMatrix {
    pub kinetic: LayerMultipliers,
    pub energy: LayerMultipliers,
    pub explosive: LayerMultipliers,
}

impl DamageMatrix {
    /// The `(vs_shields, vs_armor)` multipliers for an incoming damage type.
    pub fn for_type(&self, ty: DamageType) -> LayerMultipliers {
        match ty {
            DamageType::Kinetic => self.kinetic,
            DamageType::Energy => self.energy,
            DamageType::Explosive => self.explosive,
        }
    }
}

/// One damage type's multipliers against each defense layer (bp; `10_000` = ×1.0).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerMultipliers {
    /// Multiplier vs shields (Kinetic `14_000` = ×1.4 shreds; Energy `6_000` = ×0.6 bounces).
    pub vs_shields: Bp,
    /// Multiplier vs armor/hull (Kinetic `8_500` = ×0.85 folds; Energy `12_500` = ×1.25 melts).
    pub vs_armor: Bp,
}

/// Ticks between shots for each cadence tier (stat block §1).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CadenceTicks {
    pub fast: u16,
    pub medium: u16,
    pub slow: u16,
    pub siege: u16,
}

impl CadenceTicks {
    /// The cooldown (ticks) for a tier.
    pub fn ticks(&self, tier: CadenceTier) -> u16 {
        match tier {
            CadenceTier::Fast => self.fast,
            CadenceTier::Medium => self.medium,
            CadenceTier::Slow => self.slow,
            CadenceTier::Siege => self.siege,
        }
    }
}

/// Air-combat modifiers (stat block §1). Indirect Artillery "never targets air" is a *structural*
/// rule enforced in targeting, not a number, so it has no field here.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AirModifiers {
    /// AA vs air: additive accuracy bonus, bp (`+1_000` = +0.10).
    pub aa_acc_bonus: Bp,
    /// AA vs air: damage multiplier, bp (`15_000` = ×1.5).
    pub aa_dmg_mult: Bp,
    /// Direct-fire "plink" vs air: additive accuracy penalty, bp (`-2_500` = −0.25).
    pub plink_acc_penalty: Bp,
    /// A non-AA weapon plinking **air** (a heli dogfighting, a direct-fire unit shooting up): damage
    /// multiplier, bp (`5_000` = ×0.5). Tunes air-to-air lethality independently of ground suppression.
    pub plink_dmg_mult: Bp,
    /// A SAM (Air-reach) suppressing **ground** once the skies are clear: its own damage multiplier,
    /// bp. Split from `plink_dmg_mult` so anti-air lethality and ground suppression tune separately
    /// (make dogfights deadlier without buffing SAM bombardment, or soften bombardment without
    /// weakening dogfights). Defaults to the historical shared plink value, so a ruleset row saved
    /// before this field existed deserializes with identical SAM-vs-ground behavior.
    #[serde(default = "default_sam_ground_dmg_mult")]
    pub sam_ground_dmg_mult: Bp,
}

/// Back-compat default for [`AirModifiers::sam_ground_dmg_mult`]: the historical `plink_dmg_mult`
/// content value, so a pre-split ruleset row deserializes with unchanged SAM-vs-ground behavior.
fn default_sam_ground_dmg_mult() -> Bp {
    5_000
}

/// Global combat coefficients + the tick budget (stat block §1). All bp unless a count.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalConstants {
    /// Ticks per simulated second (10).
    pub tick_rate: u16,
    /// Hard ceiling on ticks per game (1000).
    pub tick_cap: u16,
    /// ± damage variance half-width, bp (`500` = ±5%).
    pub damage_variance: Bp,
    /// Base crit chance, bp (`500` = 5%).
    pub crit_base_chance: Bp,
    /// Base crit multiplier, bp (`15_000` = ×1.5).
    pub crit_base_mult: Bp,
    /// Native-family damage bonus, bp (`1_200` = +12%).
    pub native_bonus: Bp,
    /// Min-damage floor as a fraction of the incoming hit, bp (`1_000` = 10%).
    pub min_damage_floor: Bp,
    /// Splash cap as a fraction of the hit, bp (`2_500` = 25%).
    pub splash_cap: Bp,
    /// Hit-chance clamp lower bound, bp (`500` = 5%).
    pub hit_clamp_min: Bp,
    /// Hit-chance clamp upper bound, bp (`9_500` = 95%).
    pub hit_clamp_max: Bp,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixed::Fixed;
    use crate::model::types::{MountClass, ReachTag, SlotLayout, ZoneId};

    #[test]
    fn damage_matrix_lookup_matches_stat_block() {
        let m = sample_matrix();
        assert_eq!(m.for_type(DamageType::Kinetic).vs_shields, 14_000); // ×1.4
        assert_eq!(m.for_type(DamageType::Kinetic).vs_armor, 8_500); // ×0.85
        assert_eq!(m.for_type(DamageType::Energy).vs_shields, 6_000); // ×0.6
        assert_eq!(m.for_type(DamageType::Energy).vs_armor, 12_500); // ×1.25
        assert_eq!(m.for_type(DamageType::Explosive).vs_armor, 10_000); // ×1.0
    }

    #[test]
    fn cadence_ticks_lookup() {
        let c = CadenceTicks {
            fast: 1,
            medium: 3,
            slow: 5,
            siege: 10,
        };
        assert_eq!(c.ticks(CadenceTier::Fast), 1);
        assert_eq!(c.ticks(CadenceTier::Siege), 10);
    }

    #[test]
    fn ruleset_round_trips_and_keys_are_strings() {
        let rs = sample_ruleset();
        let json = serde_json::to_string(&rs).unwrap();
        // BTreeMap<MachineTypeId, _> keys serialize as bare strings (valid JSON object keys).
        assert!(json.contains("\"HeavyTank\""));
        let back: Ruleset = serde_json::from_str(&json).unwrap();
        assert_eq!(rs, back);
    }

    #[test]
    fn ruleset_hash_is_stable_and_sensitive() {
        let rs = sample_ruleset();
        let h1 = rs.hash();
        let h2 = rs.hash();
        assert_eq!(h1, h2, "same ruleset → same hash (recompute-stable)");
        assert_eq!(h1.0.len(), 64, "BLAKE3 hex is 32 bytes = 64 hex chars");

        // Flip one tunable number → the hash must change.
        let mut rs2 = sample_ruleset();
        rs2.globals.native_bonus += 1;
        assert_ne!(rs.hash(), rs2.hash(), "a changed number changes the hash");
    }

    // --- fixtures ---

    fn sample_matrix() -> DamageMatrix {
        DamageMatrix {
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
        }
    }

    /// A one-type / one-variant / no-equipment Ruleset — just enough to exercise the type.
    /// (The full 7×3 content fixture is T014.)
    fn sample_ruleset() -> Ruleset {
        let mut machine_types = BTreeMap::new();
        machine_types.insert(
            MachineTypeId::HeavyTank,
            MachineType {
                id: MachineTypeId::HeavyTank,
                native_family: Some(crate::model::types::DamageFamily::Kinetic),
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
        variants.insert(
            VariantId::new("Grizzly"),
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
            },
        );

        Ruleset {
            machine_types,
            chassis,
            variants,
            equipment: BTreeMap::new(),
            damage_matrix: sample_matrix(),
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
        }
    }
}
