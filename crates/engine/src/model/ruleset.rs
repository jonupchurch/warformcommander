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
    BaseStats, CadenceTier, ChassisVariant, DamageType, EquipmentId, EquipmentModule,
    MachineType, MachineTypeId, RoleDamageBonus, VariantId,
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
    /// Per-attacker-type "role counter" damage bonuses vs specific target types (e.g. light tanks vs
    /// the fragile backline). Empty by default and **omitted from serialization when empty**, so a
    /// ruleset without it hashes identically to one before the field existed (hash-stable).
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub role_damage_bonuses: BTreeMap<MachineTypeId, RoleDamageBonus>,
    /// Ablative-layer tuning (v2). The save chance is the only knob; sizing lives on each module.
    /// Omitted from serialization at the default (hash-stable).
    #[serde(default, skip_serializing_if = "AblativeMods::is_default")]
    pub ablative_mods: AblativeMods,
    /// Per-mount-class defensive magnitude scaling (v2) — **the single point of adjustment for
    /// rebalancing the entire defense system**. Every generated defense module multiplies its
    /// magnitude by its mount's factor, so the fragile back-rank chassis get proportionally less
    /// out of the same slot. Omitted from serialization at the default (hash-stable).
    #[serde(default, skip_serializing_if = "MountScale::is_default")]
    pub mount_scale: MountScale,
    /// Stance fire-priority offsets (v2) — the aggro tiers that narrow the candidate row before the
    /// Target Rule picks. An allocation axis, not a magnitude one. Omitted at the default (hash-stable).
    #[serde(default, skip_serializing_if = "StanceAggro::is_default")]
    pub stance_aggro: StanceAggro,
    /// The Opportunist execute bonus (v2) — extra damage against targets below a hull threshold.
    /// Omitted from serialization at the default (hash-stable).
    #[serde(default, skip_serializing_if = "ExecuteMods::is_default")]
    pub execute_mods: ExecuteMods,
    /// The Empower support stance (v2) — the overshield ceiling a support machine can raise an ally to
    /// instead of repairing it. Omitted from serialization at the default (hash-stable).
    #[serde(default, skip_serializing_if = "EmpowerMods::is_default")]
    pub empower_mods: EmpowerMods,
    /// Reactive plating (v2, Mech) — the mitigation rate applied to the dominant absorbed damage
    /// family. Omitted from serialization at the default (hash-stable).
    #[serde(default, skip_serializing_if = "ReactiveMods::is_default")]
    pub reactive_mods: ReactiveMods,
    /// Coordination (v3, spec 014) — diminishing returns on stacking identical units, the direct
    /// flattener for the field's super-linear composition power. Omitted from serialization at the
    /// identity curve (hash-stable), so the stock field is unchanged until the seed opts in.
    #[serde(default, skip_serializing_if = "Coordination::is_default")]
    pub coordination: Coordination,
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


/// Ablative-defense tuning (v2). The ablative pool absorbs flat (no damage-matrix multiplier — it is
/// the layer indifferent to *what* is shooting it, only *how long*), does not regenerate, and gives
/// each incoming hit a fixed chance not to deplete it. The save is bounded texture, not a decider:
/// absorption is always capped at the remaining pool first, so a save preserves capacity but never
/// grants free absorption beyond it.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AblativeMods {
    /// Probability (bp) that a hit against the pool does **not** deplete it. `2_000` = 20%.
    pub save_chance: Bp,
}

impl Default for AblativeMods {
    fn default() -> Self {
        AblativeMods { save_chance: 2_000 }
    }
}

impl AblativeMods {
    /// Serialization skip at the default (hash stability).
    pub fn is_default(&self) -> bool {
        *self == AblativeMods::default()
    }
}

/// Per-mount-class defensive magnitude scaling (v2). A single multiplier per mount class applied to
/// every defense family's magnitude, so rebalancing the whole system is one edit here rather than 28
/// module edits. The fragile back-rank mounts (Heli/RktArty/Artillery) carry the lowest factors so
/// their best defensive option still lands at or below their current durability (spec FR-011/SC-008).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MountScale {
    pub heavy: Bp,
    pub light: Bp,
    pub mech: Bp,
    pub heli: Bp,
    pub rkt_arty: Bp,
    pub artillery: Bp,
    pub support: Bp,
}

impl Default for MountScale {
    /// `10_000` = ×1.0. The line mounts (Heavy/Mech) get full value; the fragile mounts get less, so
    /// lighting up their dead defense slot does not make them tankier than they are today.
    fn default() -> Self {
        MountScale {
            heavy: 10_000,
            light: 8_000,
            mech: 10_000,
            heli: 6_000,
            rkt_arty: 7_000,
            artillery: 7_000,
            support: 9_000,
        }
    }
}

impl MountScale {
    /// The factor for a mount class (bp).
    pub fn for_mount(&self, mount: crate::model::types::MountClass) -> Bp {
        use crate::model::types::MountClass;
        match mount {
            MountClass::Heavy => self.heavy,
            MountClass::Light => self.light,
            MountClass::Mech => self.mech,
            MountClass::Heli => self.heli,
            MountClass::RktArty => self.rkt_arty,
            MountClass::Artillery => self.artillery,
            MountClass::Support => self.support,
        }
    }

    /// Serialization skip at the default (hash stability).
    pub fn is_default(&self) -> bool {
        *self == MountScale::default()
    }
}

/// What counts as "identical" for coordination (spec 014): same machine **type**, or same
/// type **and** variant. `Type` is the default — the super-linearity is role redundancy (three
/// HeavyTanks step on each other's supply) regardless of exact stat line.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CoordinationGrain {
    Type,
    TypeVariant,
}

/// Which derived stats the coordination factor scales (spec 014). `Offense` (default) is the most
/// legible — the Nth copy hits softer; `OffenseAndSurvivability` also thins its hull/shield.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CoordinationScales {
    Offense,
    OffenseAndSurvivability,
}

/// **Coordination** (spec 014, the counter-web pass) — diminishing returns on stacking identical
/// units. The diagnosis found the field was a near-total power order because composition power is
/// **super-linear in unit count** (the 2nd copy of a specialist crosses a rank boundary). This taxes
/// the Nth identical unit so mono-stacks fall off and combined-arms diversity is rewarded (P2/P3),
/// flattening the ladder so matchups land near parity. Applied at **army-build time**
/// (`sim::build_combatants`), never in per-machine derive, so the derive-parity fixture is untouched.
/// The default (identity) scales everything ×1.0 — no behavioural change — and is omitted from
/// serialization, so the stock field stays byte-identical until the seed sets a real curve.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Coordination {
    /// Effectiveness (bp) of the 1st, 2nd, … Nth identical unit in an army. `returns[0]` is `10_000`
    /// (×1.0 — the first copy is always full); index past the end clamps to the last entry.
    pub returns: Vec<Bp>,
    pub grain: CoordinationGrain,
    pub scales: CoordinationScales,
}

impl Default for Coordination {
    /// Identity: one full-effectiveness entry → every unit ×1.0 → exactly current behaviour.
    fn default() -> Self {
        Coordination {
            returns: vec![10_000],
            grain: CoordinationGrain::Type,
            scales: CoordinationScales::Offense,
        }
    }
}

impl Coordination {
    /// The effectiveness factor (bp) for a unit at duplicate `rank` (0 = the first copy).
    pub fn factor(&self, rank: usize) -> Bp {
        let last = self.returns.len().saturating_sub(1);
        self.returns.get(rank.min(last)).copied().unwrap_or(10_000)
    }

    /// Serialization skip at the identity curve (hash stability): default grain/scales and every
    /// entry `10_000`. Any all-full curve is treated as identity so a no-op never re-blesses goldens.
    pub fn is_default(&self) -> bool {
        self.grain == CoordinationGrain::Type
            && self.scales == CoordinationScales::Offense
            && self.returns.iter().all(|&r| r == 10_000)
    }
}

/// Stance fire-priority offsets (v2). **Lower is targeted first.** These are *relative* within a row:
/// a uniform set of offsets is a no-op (FR-017), so the dial expresses a ranking of one's own units,
/// not an acquired bonus. Combat stances (Aggressive/Defensive/Protector) carry real offsets; the
/// support and gated stances sit at 0 (their behaviour lives elsewhere).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StanceAggro {
    pub aggressive: i8,
    pub neutral: i8,
    pub defensive: i8,
    pub protector: i8,
    pub opportunist: i8,
    pub triage: i8,
    pub sustain: i8,
    pub empower: i8,
}

impl Default for StanceAggro {
    /// Aggressive/Protector draw fire (−1), Defensive sheds it (+1), everything else is tier-neutral.
    /// Protector shares Aggressive's tier; its distinction is cross-zone reach, not a deeper tier.
    fn default() -> Self {
        StanceAggro {
            aggressive: -1,
            neutral: 0,
            defensive: 1,
            protector: -1,
            opportunist: 0,
            triage: 0,
            sustain: 0,
            empower: 0,
        }
    }
}

impl StanceAggro {
    /// The fire-priority offset for a stance (lower is targeted first).
    pub fn offset(&self, stance: crate::model::types::Stance) -> i8 {
        use crate::model::types::Stance;
        match stance {
            Stance::Aggressive => self.aggressive,
            Stance::Neutral => self.neutral,
            Stance::Defensive => self.defensive,
            Stance::Protector => self.protector,
            Stance::Opportunist => self.opportunist,
            Stance::Triage => self.triage,
            Stance::Sustain => self.sustain,
            Stance::Empower => self.empower,
        }
    }

    /// Serialization skip at the default (hash stability).
    pub fn is_default(&self) -> bool {
        *self == StanceAggro::default()
    }
}

/// The Opportunist execute bonus (v2). Extra damage against a target below `threshold` hull — the one
/// stance that is a self-trade on the otherwise team-trade stance dial, which is why it is the gated,
/// premium pick. Setting `bonus` to `0` disables the mechanic without a code change (individually
/// reversible, like every v2 balance lever).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteMods {
    /// Hull fraction (bp) at or below which the bonus applies. `4_000` = 40%.
    pub threshold: Bp,
    /// Additive damage multiplier above `BP_ONE` against a target under the threshold. `3_000` = +30%.
    pub bonus: Bp,
}

impl Default for ExecuteMods {
    fn default() -> Self {
        ExecuteMods {
            threshold: 4_000,
            bonus: 3_000,
        }
    }
}

impl ExecuteMods {
    /// Serialization skip at the default (hash stability).
    pub fn is_default(&self) -> bool {
        *self == ExecuteMods::default()
    }
}

/// The Empower support stance (v2). Instead of repairing hull, an Empower support raises each ally's
/// shield toward a ceiling — a net effective-HP gain above the natural shield cap, refreshed each tick
/// while the support lives and the ally stays in range. The rate is the support's own `support_power`
/// (the amount it would otherwise have healed); this table only sets the ceiling. Setting the ceiling
/// below every ally's natural shield cap disables the mechanic without a code change.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmpowerMods {
    /// Overshield ceiling as a fraction of the ally's max hull (bp). `3_000` = up to +30% max-hull
    /// worth of shield. The pool is bounded here, so Empower can never run away.
    pub shield_cap_bp: Bp,
}

impl Default for EmpowerMods {
    fn default() -> Self {
        EmpowerMods {
            shield_cap_bp: 3_000,
        }
    }
}

impl EmpowerMods {
    /// The overshield ceiling (Fixed) for a machine with `max_hull`.
    pub fn ceiling(&self, max_hull: crate::fixed::Fixed) -> crate::fixed::Fixed {
        max_hull.mul_bp(self.shield_cap_bp)
    }

    /// Serialization skip at the default (hash stability).
    pub fn is_default(&self) -> bool {
        *self == EmpowerMods::default()
    }
}

/// Reactive plating (v2, Mech-exclusive). Once a reactive Mech has absorbed hull damage from a family,
/// further hits of that (currently dominant) family are scaled by `rate` — so the chassis is punished
/// by burst (nothing absorbed yet → no bonus) and rewards attrition. `rate == BP_ONE` disables the
/// mechanic without a code change. The bias only ever *reduces* incoming damage (`rate ≤ BP_ONE`), so
/// reactive plating is never worse than its Balanced baseline at battle start (data-model §5.2).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReactiveMods {
    /// Damage multiplier (bp) applied to the dominant absorbed family. `8_000` = ×0.8 (−20%).
    pub rate: Bp,
}

impl Default for ReactiveMods {
    fn default() -> Self {
        ReactiveMods { rate: 8_000 }
    }
}

impl ReactiveMods {
    /// Serialization skip at the default (hash stability).
    pub fn is_default(&self) -> bool {
        *self == ReactiveMods::default()
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
    /// A **flak** platform (the `AntiAir` capability, a non-`Air`-reach weapon) firing on **air**: its
    /// damage multiplier, bp. Defaults to `10_000` (×1.0 — full damage, no plink penalty), i.e. "target
    /// air without losing damage to plinking". Tunable up toward the SAM's `aa_dmg_mult` to make flak a
    /// harder counter, or down to soften it. Omitted from serialization at the default, so a ruleset
    /// saved before flak existed hashes identically (no golden churn).
    #[serde(
        default = "default_flak_dmg_mult",
        skip_serializing_if = "is_default_flak_dmg_mult"
    )]
    pub flak_dmg_mult: Bp,
    /// **Anti-air fire discipline**: how many attackers may engage each living enemy air unit per
    /// tick. Without a cap, air-first targeting lets a *single* cheap aircraft monopolise an entire
    /// air-defence network — every SAM is locked onto it (`ReachTag::Air` engages air exclusively)
    /// and every flak platform is diverted from the ground fight — so bringing more AA made an army
    /// *weaker* against a one-aircraft splash. Attackers beyond the cap treat air as unreachable and
    /// engage ground normally, so committing AA scales with the air threat instead of against it.
    /// Omitted from serialization at the default, so a ruleset saved before this existed hashes
    /// identically (no golden churn) and picks the behavior up on deploy.
    #[serde(
        default = "default_aa_focus_per_air",
        skip_serializing_if = "is_default_aa_focus_per_air"
    )]
    pub aa_focus_per_air: u32,
    /// **Energy weapons contest air** (v2, staged US4). A ground *energy* weapon engaging air deals
    /// damage at this rate — meant to sit strictly between the incidental "plink" rate and the dedicated
    /// flak rate (FR-028), so an army carrying lasers has partial recourse against aircraft without a
    /// dedicated counter. `0` (the default) **disables the mechanic entirely** — energy weapons can
    /// neither reach nor hit air, exactly as before v2 — so the field is unchanged until a ruleset
    /// re-seed turns it on. It is the one air change that genuinely shifts the stock field, so it ships
    /// and is measured in isolation (FR-030). Omitted from serialization at `0` (hash-stable).
    #[serde(default, skip_serializing_if = "is_zero_bp")]
    pub energy_air_dmg_mult: Bp,
}

/// Serialization skip for a `Bp` field at its `0` default (hash stability for an off-by-default knob).
fn is_zero_bp(v: &Bp) -> bool {
    *v == 0
}

/// Back-compat default for [`AirModifiers::sam_ground_dmg_mult`]: the historical `plink_dmg_mult`
/// content value, so a pre-split ruleset row deserializes with unchanged SAM-vs-ground behavior.
fn default_sam_ground_dmg_mult() -> Bp {
    5_000
}

/// Default for [`AirModifiers::flak_dmg_mult`]: `10_000` = ×1.0 (full damage, no plink). A ruleset
/// without the field (or at the default) deserializes/serializes identically to one before flak.
fn default_flak_dmg_mult() -> Bp {
    10_000
}

/// Default for [`AirModifiers::aa_focus_per_air`]: two attackers per living enemy aircraft — enough
/// that a committed air wing is genuinely threatened, few enough that one aircraft cannot soak an
/// entire army's anti-air output.
fn default_aa_focus_per_air() -> u32 {
    2
}

/// Serialization skip for [`AirModifiers::aa_focus_per_air`] at its default (hash stability).
fn is_default_aa_focus_per_air(v: &u32) -> bool {
    *v == default_aa_focus_per_air()
}

/// Whether `flak_dmg_mult` is at its default (so it can be omitted from serialization → hash-stable).
fn is_default_flak_dmg_mult(v: &Bp) -> bool {
    *v == 10_000
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
            ablative_mods: AblativeMods::default(),
            mount_scale: MountScale::default(),
            stance_aggro: StanceAggro::default(),
            execute_mods: ExecuteMods::default(),
            empower_mods: EmpowerMods::default(),
            reactive_mods: ReactiveMods::default(),
            coordination: Coordination::default(),
        }
    }
}
