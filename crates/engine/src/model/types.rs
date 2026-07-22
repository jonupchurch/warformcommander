//! Tier 1 — content / configuration types (data-model Tier 1, T010).
//!
//! *What a player builds*: the seven [`MachineType`]s, their [`ChassisVariant`]s,
//! the [`EquipmentModule`] catalog, the [`BehaviorDials`] + [`PlanBTrigger`]s, and
//! the [`Preset`]/[`Loadout`] bundles. These are the **authored input** to the
//! engine — pure data, no logic (FR-007). The *numbers* per variant/equipment live
//! in the [`Ruleset`](crate::model::ruleset) (Tier 2, the balance table); these types
//! carry identity, shape, and gating.
//!
//! **Numeric conventions** (P6 — no floats anywhere):
//! - Quantities (hull, shields, damage, support) are [`Fixed`] milli-units.
//! - Fractions / multipliers (armor %, accuracy, evasion, splash, crit, penetration)
//!   are [`Bp`] basis points (`10_000` = `1.0`).
//!
//! Structs serialize `camelCase` (matching the TS mirror in `contracts/`); fieldless
//! enums serialize as their PascalCase variant name (matching data-model spelling).

use serde::{Deserialize, Serialize};

use crate::fixed::{Bp, Fixed};

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/// The seven machine classes — a **closed** set (the roster is fixed; variants extend it).
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum MachineTypeId {
    HeavyTank,
    LightTank,
    Mech,
    AttackHeli,
    RocketArtillery,
    Artillery,
    RearSupport,
}

macro_rules! string_id {
    ($(#[$doc:meta])* $name:ident) => {
        $(#[$doc])*
        #[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub String);

        impl $name {
            pub fn new(s: impl Into<String>) -> Self {
                Self(s.into())
            }
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }
        impl From<&str> for $name {
            fn from(s: &str) -> Self {
                Self(s.to_owned())
            }
        }
        impl From<String> for $name {
            fn from(s: String) -> Self {
                Self(s)
            }
        }
    };
}

string_id! {
    /// A chassis variant id (e.g. `Grizzly`). **Extensible** (FR-002) → string-keyed data,
    /// not an enum, so a new variant is a Ruleset entry rather than a code change.
    VariantId
}
string_id! {
    /// An equipment module id (e.g. `HeavyCannon`). Extensible catalog → string-keyed.
    EquipmentId
}
string_id! {
    /// A saved-preset id.
    PresetId
}

// ---------------------------------------------------------------------------
// Small closed enums (the counter-web + placement vocabulary)
// ---------------------------------------------------------------------------

/// The damage-matrix axes (stat block §1). Support does **no** matrix damage.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum DamageType {
    Kinetic,
    Energy,
    Explosive,
}

/// A unit's / weapon's native family — matrix families plus `Support`. A weapon whose
/// `family` equals its wielder's native family earns the +12% native bonus; **Mech is a
/// generalist** (`native_family == None`) and never does (stat block §1).
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum DamageFamily {
    Kinetic,
    Energy,
    Explosive,
    Support,
}

impl DamageFamily {
    /// The matrix [`DamageType`] this family deals, or `None` for `Support` (which heals).
    pub fn as_damage_type(self) -> Option<DamageType> {
        match self {
            DamageFamily::Kinetic => Some(DamageType::Kinetic),
            DamageFamily::Energy => Some(DamageType::Energy),
            DamageFamily::Explosive => Some(DamageType::Explosive),
            DamageFamily::Support => None,
        }
    }
}

/// The four battlefield rows, **ordered** (front-to-back on the ground; Air is separate).
/// Ordering is the deterministic tie-break spine (zone order → placement index).
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum ZoneId {
    Air,
    Front,
    Middle,
    Rear,
}

/// Mount weight class — gates which weapons/defenses fit a machine (FR-009, V4).
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum MountClass {
    Heavy,
    Light,
    Mech,
    Heli,
    RktArty,
    Artillery,
    Support,
}

/// A weapon's reach class — *which enemy rows it can engage from its own row* (stat block §1/§4).
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum ReachTag {
    /// Nearest occupied enemy ground row, collapsing forward (Front-row default).
    Nearest,
    /// Enemy Front + Middle (Middle-row weapons).
    FrontMid,
    /// Any enemy ground row from any row (indirect: Artillery / Rocket-Arty barrage).
    AnyGround,
    /// Air targets (AA / air-capable direct fire).
    Air,
    /// Extended straight-line reach (e.g. Railgun) — deeper than `Nearest`.
    Deep,
}

/// Fire-cadence tier — ticks between shots (stat block §1).
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum CadenceTier {
    /// 1 tick (10 shots/s).
    Fast,
    /// 3 ticks.
    Medium,
    /// 5 ticks.
    Slow,
    /// 10 ticks (the big lob).
    Siege,
}

impl CadenceTier {
    /// One tier faster, saturating at [`Fast`](CadenceTier::Fast) (Autoloader; "min Fast").
    pub fn faster(self) -> CadenceTier {
        match self {
            CadenceTier::Fast | CadenceTier::Medium => CadenceTier::Fast,
            CadenceTier::Slow => CadenceTier::Medium,
            CadenceTier::Siege => CadenceTier::Slow,
        }
    }

    /// One tier slower, saturating at [`Siege`](CadenceTier::Siege).
    pub fn slower(self) -> CadenceTier {
        match self {
            CadenceTier::Fast => CadenceTier::Medium,
            CadenceTier::Medium => CadenceTier::Slow,
            CadenceTier::Slow | CadenceTier::Siege => CadenceTier::Siege,
        }
    }
}

/// A support unit's reach for heals/auras.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum SupportRange {
    OwnZone,
    OwnPlusAdjacent,
    /// Every zone — a backline medic can heal the front line where damage actually lands.
    WholeArmy,
}

// ---------------------------------------------------------------------------
// Slot layout, stat deltas, and shared value bags
// ---------------------------------------------------------------------------

/// How many of each slot a machine exposes (default 1/1/3; some variants → 4 utility).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotLayout {
    pub weapon: u8,
    pub defense: u8,
    pub utility: u8,
}

impl SlotLayout {
    /// The 1 weapon / 1 defense / 3 utility default.
    pub const STANDARD: SlotLayout = SlotLayout {
        weapon: 1,
        defense: 1,
        utility: 3,
    };
    /// The 1 / 1 / 4 layout (Sentinel mech, Command Post support).
    pub const FOUR_UTILITY: SlotLayout = SlotLayout {
        weapon: 1,
        defense: 1,
        utility: 4,
    };
}

/// A bag of equipment-applied stat changes. **Additive deltas** default to zero (`Bp`/`Fixed`);
/// the two override fields (`cadence_tier`, `reach`) are `Some` only when a module *replaces*
/// the base value (e.g. a weapon setting its own cadence/reach). `#[serde(default)]` lets a
/// fixture spell out only what actually changes.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StatDeltas {
    /// Additive damage delta (milli-units). A weapon typically *sets* damage via a large delta
    /// atop a zero base; utilities nudge it.
    pub damage: Fixed,
    /// Additive accuracy delta (bp), e.g. Fire Control `+800`.
    pub accuracy: Bp,
    /// Additive splash delta (bp), capped downstream at the ruleset splash cap.
    pub splash: Bp,
    /// Additive armor-penetration delta (bp).
    pub penetration: Bp,
    /// Additive evasion delta (bp).
    pub evasion: Bp,
    /// Additive armor-percentage delta (bp), e.g. Composite Armor `+1200`.
    pub armor_pct: Bp,
    /// Additive crit-chance delta (bp).
    pub crit_chance: Bp,
    /// Additive move-speed delta (zone-transition steps), e.g. Drive Servos `+2`, a `-1` tradeoff.
    pub move_speed: i8,
    /// **Override** the cadence tier outright (a weapon's own tier), not a delta.
    pub cadence_tier: Option<CadenceTier>,
    /// **Override** the reach tag outright (a weapon's own reach), not a delta.
    pub reach: Option<ReachTag>,
}

/// A shield's three coupled numbers, as deltas a defense module contributes (a no-shield
/// hull gains a shield when a shield defense is equipped: `0 + cap`).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShieldDelta {
    pub cap: Fixed,
    pub regen: Fixed,
    /// Delta on the ticks-untouched-before-regen delay (may be negative).
    pub delay: i16,
}

/// An ablative-pool grant (v2). A one-time absorption capacity that does **not** regenerate — the
/// front-loaded, streaky defensive layer. Sits between shields and hull, absorbs flat (no matrix
/// multiplier), and gives each hit a chance not to deplete it (`AblativeMods::save_chance`).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AblativeDelta {
    /// The pool's starting (and maximum) capacity. Never regenerates once spent.
    pub cap: Fixed,
}

/// A targeted mitigation special (e.g. Blast Plating: −40% Explosive **splash** taken).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MitigationMod {
    /// Which incoming damage type this mitigates.
    pub against: DamageType,
    /// Multiplier (bp) applied to splash taken from `against` — `6_000` = ×0.6 (−40%).
    pub splash_taken_mult: Bp,
}

/// A passive zone aura (Bulwark's −8% damage to zone allies; Command Post's C&C boost).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuraEffect {
    pub kind: AuraKind,
    /// Signed magnitude in bp (e.g. `-800` = −8%).
    pub magnitude: Bp,
    pub scope: AuraScope,
}

/// What an [`AuraEffect`] modifies.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum AuraKind {
    /// Scales allies' outgoing/dealt damage.
    DamageDealt,
    /// Command-and-control boost (Command Post) — reserved for support-flavor resolution.
    CommandBoost,
    /// At **match start**, confer a one-time shield to allies in scope, sized by [`AuraEffect::magnitude`]
    /// as a fraction (bp) of each recipient's max hull (a rear-support role feature). Applied once, at
    /// setup — the shield sits above the recipient's cap and depletes without regenerating.
    StartShield,
}

/// Who an [`AuraEffect`] reaches.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum AuraScope {
    ZoneAllies,
    /// Every allied machine on the same side, regardless of zone.
    AllAllies,
}

/// A per-attacker-type damage bonus versus a set of target machine types — a "role counter" (e.g.
/// light tanks hitting the fragile backline harder). Stored in [`Ruleset::role_damage_bonuses`]
/// keyed by the *attacker's* machine type; applied per target at impact.
///
/// [`Ruleset::role_damage_bonuses`]: crate::model::ruleset::Ruleset::role_damage_bonuses
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleDamageBonus {
    /// The target machine types this bonus applies against.
    pub vs: Vec<MachineTypeId>,
    /// Additive damage multiplier, bp (`5_000` = +50% vs the listed types).
    pub mult: Bp,
}

// ---------------------------------------------------------------------------
// Base stats
// ---------------------------------------------------------------------------

/// A variant's fixed base-stat identity (data-model → BaseStats). The **numbers live in the
/// [`Ruleset`](crate::model::ruleset)** keyed by [`VariantId`]; this struct is the shape the
/// balance table fills. Cadence is included here (it is a base offensive stat straight from the
/// stat block §2) rather than split onto [`ChassisVariant`] — one home for the derivation to read.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseStats {
    // --- Survivability ---
    pub hull: Fixed,
    /// Armor percentage reduction, bp (`3_000` = 30%).
    pub armor_pct: Bp,
    pub shield_cap: Fixed,
    /// Shield regen per tick.
    pub shield_regen: Fixed,
    /// Ticks untouched before regen resumes.
    pub shield_delay: u16,

    // --- Offense (the native weapon baseline; equipment overrides via deltas) ---
    pub damage: Fixed,
    pub damage_type: DamageType,
    pub cadence: CadenceTier,
    /// Accuracy, bp.
    pub accuracy: Bp,
    /// Crit chance, bp.
    pub crit_chance: Bp,
    /// Crit multiplier, bp (`15_000` = ×1.5).
    pub crit_mult: Bp,
    /// Splash fraction, bp (≤ splash cap).
    pub splash: Bp,
    /// Armor penetration, bp.
    pub penetration: Bp,
    pub reach: ReachTag,

    // --- Mobility ---
    /// Zone-transition capability: `Some(0)` = immobile, `Some(n)` = mobile, `None` = air-locked (heli).
    pub move_speed: Option<u8>,
    /// Evasion, bp.
    pub evasion: Bp,
    /// Aggro weight for threat-based targeting.
    pub threat: Fixed,

    // --- Support (only the support class populates these) ---
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub support_power: Option<Fixed>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub support_range: Option<SupportRange>,
}

// ---------------------------------------------------------------------------
// Machine type + variant identity
// ---------------------------------------------------------------------------

/// One of the seven unit classes — immutable identity a variant cannot change (FR-001/002).
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineType {
    pub id: MachineTypeId,
    /// The native family; `None` = generalist (Mech), which never earns the native bonus.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub native_family: Option<DamageFamily>,
    /// Eligible starting zones (heli → `[Air]`; ground → `[Front, Middle, Rear]`).
    pub home_zones: Vec<ZoneId>,
    pub mount_class: MountClass,
    pub slot_layout: SlotLayout,
    /// Only Artillery + Rocket-Artillery may fire from the Rear row (§4).
    pub can_fire_from_rear: bool,
    /// Whether the native weapon can target Air at all.
    pub air_capable_by_default: bool,
}

/// A chassis variant — identity + shape only; its **numbers** live in the Ruleset keyed by `id`
/// (the clean Tier-1/Tier-2 split). Never shifts the native damage family.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChassisVariant {
    pub id: VariantId,
    pub type_id: MachineTypeId,
    /// Raises utility slots for the odd variant (Sentinel, Command Post → 4).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub slot_layout_override: Option<SlotLayout>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub passive_aura: Option<AuraEffect>,
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

/// A Weapon, Defense, or Utility item. Every choice is a **trade-off, never a strict upgrade**
/// (FR-003, P1). Common `id`/`name` sit outside the [`EquipmentSpec`] union.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquipmentModule {
    pub id: EquipmentId,
    pub name: String,
    #[serde(flatten)]
    pub spec: EquipmentSpec,
}

/// The three equipment kinds as a discriminated union (`{ "kind": "Weapon", ... }`).
/// The inner structs camelCase their own fields; the tag stays PascalCase.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum EquipmentSpec {
    Weapon(WeaponSpec),
    Defense(DefenseSpec),
    Utility(UtilitySpec),
}

/// A weapon — gated by `mount_class`; `family` may cross over from the wielder's native family.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeaponSpec {
    pub mount_class: MountClass,
    pub family: DamageFamily,
    pub stat_deltas: StatDeltas,
}

/// A defense — sets the primary mitigation layer (armor and/or shield), gated by `mount_class`.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefenseSpec {
    pub mount_class: MountClass,
    /// Additive armor-% delta, bp (Composite Armor `+1200`).
    pub armor_pct_delta: Bp,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub shield_delta: Option<ShieldDelta>,
    /// An ablative pool (v2) — one-time, non-regenerating absorption. Omitted at the ×1.0 default so a
    /// pre-v2 ruleset hashes identically.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub ablative_delta: Option<AblativeDelta>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub special_mitigation: Option<MitigationMod>,
    /// The cost of the defense (e.g. −1 Move).
    pub tradeoff: StatDeltas,
}

/// A utility — ungated, **no duplicates on one machine**; may unlock capabilities.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UtilitySpec {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub stat_deltas: Option<StatDeltas>,
    /// Capabilities this utility grants (gates advanced dials/Plan-B/reach/air).
    #[serde(default)]
    pub unlocks: Vec<Capability>,
    /// Cadence tiers to shift faster (positive = faster, min Fast); `0` = no shift.
    #[serde(default)]
    pub cadence_shift: i8,
}

/// A capability an equipped utility can unlock (gates otherwise-illegal dials/options — V6/V7).
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum Capability {
    /// +1 Plan-B slot (Combat AI Core) — the only way to a 2nd Plan-B (V6).
    ExtraPlanBSlot,
    /// Unlocks the `Adaptive` energy mode.
    AdaptiveEnergy,
    /// Unlocks the `Opportunist` stance.
    OpportunistStance,
    /// +1 zone of reach (Rangefinder).
    ExtendReach,
    /// Lets a non-AA weapon target Air (Sensor Suite).
    TargetAir,
    /// Flak targeting (Flak Battery): lets a ground unit engage Air **and** hit it at the tunable
    /// `flak_dmg_mult` rate instead of the plink penalty — a real anti-air platform, not a spotter.
    /// Added last to keep the enum's `Ord`/serialization stable for the pre-existing variants.
    AntiAir,
}

// ---------------------------------------------------------------------------
// Behavior dials + Plan-B
// ---------------------------------------------------------------------------

/// The four always-present dials (Target Priority is the `target_row` + `target_rule` pair).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorDials {
    pub target_row: TargetRow,
    pub target_rule: TargetRule,
    pub energy: EnergyMode,
    pub movement: MovementMode,
    pub stance: Stance,
}

/// Target-row sub-pick (a). Starter: `FrontReachable`/`LastReachable`; unlockable: `Fullest`/`Weakest`.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum TargetRow {
    FrontReachable,
    LastReachable,
    FullestRow,
    WeakestRow,
}

/// Target-rule sub-pick (b). Advanced options (`TargetSupport`/`TargetAir`/`SmartCounter`) are gated.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum TargetRule {
    FocusFire,
    DisperseFire,
    Nearest,
    Weakest,
    BiggestThreat,
    TargetSupport,
    TargetAir,
    SmartCounter,
}

/// Energy allocation dial. `Overdrive`/`Fortify`/`Adaptive` are capability-gated.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum EnergyMode {
    Offense,
    Balanced,
    Defense,
    Overdrive,
    Fortify,
    Adaptive,
}

/// Movement dial. `Kite`/`Reposition`/`Escort` are capability-gated.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum MovementMode {
    Hold,
    Advance,
    FallBack,
    Kite,
    Reposition,
    Escort,
}

/// Stance dial. `Protector`/`Opportunist` and the support flavors are capability-gated.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum Stance {
    Aggressive,
    Neutral,
    Defensive,
    Protector,
    Opportunist,
    Triage,
    Sustain,
    Empower,
}

/// Which dial a Plan-B trigger flips.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum DialKey {
    TargetRow,
    TargetRule,
    Energy,
    Movement,
    Stance,
}

/// A dial-typed value a Plan-B trigger latches (externally tagged: `{ "Energy": "Overdrive" }`).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum DialValue {
    TargetRow(TargetRow),
    TargetRule(TargetRule),
    Energy(EnergyMode),
    Movement(MovementMode),
    Stance(Stance),
}

impl DialValue {
    /// The [`DialKey`] this value belongs to — used to check `dial == plan_b_value`'s dial.
    pub fn dial(self) -> DialKey {
        match self {
            DialValue::TargetRow(_) => DialKey::TargetRow,
            DialValue::TargetRule(_) => DialKey::TargetRule,
            DialValue::Energy(_) => DialKey::Energy,
            DialValue::Movement(_) => DialKey::Movement,
            DialValue::Stance(_) => DialKey::Stance,
        }
    }
}

/// The Plan-B precedence slot. **Slot 1 wins** over Slot 2 on the same dial regardless of firing
/// order (the determinism law — the final state depends only on the *fired set* + slot priority).
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum PlanBSlot {
    Slot1,
    Slot2,
}

/// `when [condition] → set [dial] to [plan_b_value]`. Latches (fires once, stays flipped).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanBTrigger {
    pub slot: PlanBSlot,
    pub condition: TriggerCondition,
    pub dial: DialKey,
    pub plan_b_value: DialValue,
}

/// The §8.2 trigger menu (Self / Allies / Enemy / Position / Time), a representative subset for v1.
/// Externally tagged so payloads serialize cleanly (`{ "HullBelowPct": 5000 }`).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum TriggerCondition {
    /// Self hull dropped below X% (bp) — e.g. `7_500`/`5_000`/`2_500`.
    HullBelowPct(Bp),
    /// Self shield fully depleted.
    ShieldDown,
    /// Elapsed past a given tick.
    AfterTick(u16),
    /// An allied unit in this machine's zone was destroyed.
    AllyLostInZone,
    /// Any air enemy is present on the field.
    AirEnemyExists,
    /// An enemy occupies the given zone.
    EnemyInZone(ZoneId),
}

// ---------------------------------------------------------------------------
// Presets + loadouts
// ---------------------------------------------------------------------------

/// A machine's equipment picks (validated to slot layout + no-duplicate utilities in V4/V5).
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Loadout {
    pub weapon: EquipmentId,
    pub defense: EquipmentId,
    /// Length 3 (or 4 for 4-utility variants); **no duplicates** (V5).
    pub utilities: Vec<EquipmentId>,
}

/// Where a preset came from.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum PresetOrigin {
    Stock,
    Custom,
}

/// A named, type-scoped bundle of a machine's whole setup (FR-005, §8.4).
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: PresetId,
    pub name: String,
    pub type_id: MachineTypeId,
    pub variant_id: VariantId,
    pub loadout: Loadout,
    pub dials: BehaviorDials,
    /// 0–2 triggers (V6).
    #[serde(default)]
    pub plan_b: Vec<PlanBTrigger>,
    pub origin: PresetOrigin,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Fieldless enums serialize as their bare PascalCase variant name — the shape the TS
    /// mirror + data-model spell. Guards against an accidental `rename_all` on an enum.
    #[test]
    fn enum_wire_spelling() {
        assert_eq!(
            serde_json::to_string(&MachineTypeId::HeavyTank).unwrap(),
            "\"HeavyTank\""
        );
        assert_eq!(serde_json::to_string(&ZoneId::Front).unwrap(), "\"Front\"");
        assert_eq!(
            serde_json::to_string(&CadenceTier::Siege).unwrap(),
            "\"Siege\""
        );
    }

    /// `Fixed` is transparent → a bare integer (milli-units); `Bp` is a plain integer.
    #[test]
    fn fixed_serializes_as_bare_milli_integer() {
        let stats = sample_base_stats();
        let v: serde_json::Value = serde_json::to_value(stats).unwrap();
        assert_eq!(v["hull"], serde_json::json!(1_700_000)); // 1700 units in milli
        assert_eq!(v["armorPct"], serde_json::json!(3_000)); // 30% in bp
        assert_eq!(v["damageType"], serde_json::json!("Kinetic"));
    }

    /// Struct fields are camelCase per the TS contract.
    #[test]
    fn struct_fields_are_camel_case() {
        let v = serde_json::to_value(sample_base_stats()).unwrap();
        assert!(v.get("shieldCap").is_some());
        assert!(v.get("critMult").is_some());
        assert!(v.get("armorPct").is_some());
        assert!(v.get("shield_cap").is_none(), "must not be snake_case");
    }

    /// Every content type round-trips through JSON byte-for-value identically (the model is
    /// pure data — serialize/deserialize is the identity).
    #[test]
    fn full_preset_round_trips() {
        let preset = sample_preset();
        let json = serde_json::to_string(&preset).unwrap();
        let back: Preset = serde_json::from_str(&json).unwrap();
        assert_eq!(preset, back);
    }

    /// The equipment union is a `{ "kind": ... }` discriminated union with flattened id/name.
    #[test]
    fn equipment_is_internally_tagged() {
        let weapon = EquipmentModule {
            id: EquipmentId::new("HeavyCannon"),
            name: "Heavy Cannon".into(),
            spec: EquipmentSpec::Weapon(WeaponSpec {
                mount_class: MountClass::Heavy,
                family: DamageFamily::Kinetic,
                stat_deltas: StatDeltas {
                    damage: Fixed::from_int(35),
                    cadence_tier: Some(CadenceTier::Slow),
                    reach: Some(ReachTag::Nearest),
                    ..Default::default()
                },
            }),
        };
        let v = serde_json::to_value(&weapon).unwrap();
        assert_eq!(v["kind"], serde_json::json!("Weapon"));
        assert_eq!(v["id"], serde_json::json!("HeavyCannon"));
        assert_eq!(v["family"], serde_json::json!("Kinetic"));
        // round-trip preserves the variant
        let back: EquipmentModule = serde_json::from_value(v).unwrap();
        assert_eq!(weapon, back);
    }

    /// `StatDeltas` honors `#[serde(default)]`: a fixture may spell only the fields it changes.
    #[test]
    fn stat_deltas_default_fills_the_rest() {
        let json = r#"{ "accuracy": 800 }"#; // Fire Control: +0.08 acc only
        let d: StatDeltas = serde_json::from_str(json).unwrap();
        assert_eq!(d.accuracy, 800);
        assert_eq!(d.damage, Fixed::ZERO);
        assert_eq!(d.move_speed, 0);
        assert_eq!(d.cadence_tier, None);
    }

    /// A Plan-B value knows its own dial (used by the Slot-1 > Slot-2 resolution).
    #[test]
    fn dial_value_reports_its_key() {
        assert_eq!(
            DialValue::Energy(EnergyMode::Overdrive).dial(),
            DialKey::Energy
        );
        assert_eq!(DialValue::Stance(Stance::Protector).dial(), DialKey::Stance);
    }

    /// Cadence shifts saturate at the ends (Autoloader "min Fast"; Siege never faster than Slow-1).
    #[test]
    fn cadence_shifts_saturate() {
        assert_eq!(CadenceTier::Fast.faster(), CadenceTier::Fast);
        assert_eq!(CadenceTier::Slow.faster(), CadenceTier::Medium);
        assert_eq!(CadenceTier::Siege.slower(), CadenceTier::Siege);
    }

    /// Generalist (Mech) has no native family → no matrix type from it either.
    #[test]
    fn support_family_has_no_matrix_type() {
        assert_eq!(DamageFamily::Support.as_damage_type(), None);
        assert_eq!(
            DamageFamily::Energy.as_damage_type(),
            Some(DamageType::Energy)
        );
    }

    // --- fixtures for the tests above ---

    fn sample_base_stats() -> BaseStats {
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

    fn sample_preset() -> Preset {
        Preset {
            id: PresetId::new("grizzly-breacher"),
            name: "Breacher".into(),
            type_id: MachineTypeId::HeavyTank,
            variant_id: VariantId::new("Grizzly"),
            loadout: Loadout {
                weapon: EquipmentId::new("HeavyCannon"),
                defense: EquipmentId::new("CompositeArmor"),
                utilities: vec![
                    EquipmentId::new("Autoloader"),
                    EquipmentId::new("FireControl"),
                    EquipmentId::new("DriveServos"),
                ],
            },
            dials: BehaviorDials {
                target_row: TargetRow::FrontReachable,
                target_rule: TargetRule::FocusFire,
                energy: EnergyMode::Balanced,
                movement: MovementMode::Advance,
                stance: Stance::Aggressive,
            },
            plan_b: vec![PlanBTrigger {
                slot: PlanBSlot::Slot1,
                condition: TriggerCondition::HullBelowPct(5_000),
                dial: DialKey::Movement,
                plan_b_value: DialValue::Movement(MovementMode::FallBack),
            }],
            origin: PresetOrigin::Stock,
        }
    }
}
