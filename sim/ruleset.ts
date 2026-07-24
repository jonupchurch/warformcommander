/**
 * Concrete TypeScript mirror of the engine's **Tier-1 content + Tier-2 balance table** and the
 * derived [`EffectiveStats`] — the shapes the pure client derivation ([`deriveEffectiveStats`],
 * `sim/derive.ts`) and legality check ([`validateArmy`], `sim/legality.ts`) read. Tracks the Rust
 * serde serialization exactly (camelCase structs; bare-string enums; `kind`-tagged equipment;
 * `Fixed` as raw **milli-unit** integers; `Bp` as basis points). **Types only, no logic.**
 *
 * The authoritative definition is the Rust model (`crates/engine/src/model/`); the parity fixture
 * (`tests/fixtures/derive-battery.json`, emitted by the engine) pins the port to it (Feature 4 T006,
 * SC-002, constitution P8 — one derivation, shared by engine/server/Garage).
 */

import type { MachineTypeId, ZoneId } from './model';

// --- Closed enums (bare-string serialization) ------------------------------

/** The three matrix damage axes (`DamageType`). Support deals none. */
export type DamageType = 'Kinetic' | 'Energy' | 'Explosive';

/** A unit's / weapon's native family (`DamageFamily`) — matrix families plus `Support`. */
export type DamageFamily = 'Kinetic' | 'Energy' | 'Explosive' | 'Support';

/** Mount weight class (`MountClass`) — gates which weapons/defenses fit a machine (V4). */
export type MountClass =
  | 'Heavy'
  | 'Light'
  | 'Mech'
  | 'Heli'
  | 'RktArty'
  | 'Artillery'
  | 'Support';

/** A weapon's reach class (`ReachTag`) — which enemy rows it engages from its own row. */
export type ReachTag = 'Nearest' | 'FrontMid' | 'AnyGround' | 'Air' | 'Deep';

/** Fire-cadence tier (`CadenceTier`) — ticks between shots. */
export type CadenceTier = 'Fast' | 'Medium' | 'Slow' | 'Siege';

/** A support unit's reach for heals/auras (`SupportRange`). `WholeArmy` reaches every zone. */
export type SupportRange = 'OwnZone' | 'OwnPlusAdjacent' | 'WholeArmy';

/** What a support action projects onto (`SupportKind`, replay/mod.rs) — `Heal` (hull), `ShieldBoost`
 * (shield), the Commander's `Ablation` (a one-time ablative buffer, US5), or an `Aura` event. */
export type SupportKind = 'Heal' | 'ShieldBoost' | 'Aura' | 'Ablation';

/**
 * A capability an equipped utility unlocks (`Capability`) — gates advanced dials / Plan-B / reach /
 * air (V6/V7). **Declaration order is significant**: the engine emits `capabilities` as a sorted
 * set in this order (see {@link CAPABILITY_ORDER}).
 */
export type Capability =
  | 'ExtraPlanBSlot'
  | 'ExtendReach'
  | 'TargetAir'
  | 'AntiAir'
  | 'RocketPack'
  | 'OnHitPaint'
  | 'OnHitEmp'
  | 'OnHitSuppress'
  | 'OnHitSnare'
  | 'JumpJets'
  | 'StationaryBrace'
  | 'Rally'
  | 'Ambush';

/** The canonical `Capability` sort order (the Rust enum's `Ord` / declaration order). */
export const CAPABILITY_ORDER: readonly Capability[] = [
  'ExtraPlanBSlot',
  'ExtendReach',
  'TargetAir',
  'AntiAir',
  'RocketPack',
  'OnHitPaint',
  'OnHitEmp',
  'OnHitSuppress',
  'OnHitSnare',
  'JumpJets',
  'StationaryBrace',
  'Rally',
  'Ambush',
];

/** Which equipment kind a slot expects (`SlotKind`) — carried on a `WrongSlotKind` derivation error. */
export type SlotKind = 'Weapon' | 'Defense' | 'Utility';

// --- Value bags ------------------------------------------------------------

/** How many of each slot a machine exposes (`SlotLayout`; default 1/1/3, some variants 1/1/4). */
export interface SlotLayout {
  weapon: number;
  defense: number;
  utility: number;
}

/**
 * A bag of equipment-applied stat changes (`StatDeltas`). **Additive deltas** (numbers, milli for
 * `damage`, bp for the fractions, whole steps for `moveSpeed`); `cadenceTier`/`reach` are
 * **overrides** — non-null replaces the base. Fully serialized (every field present).
 */
export interface StatDeltas {
  damage: number; // milli
  accuracy: number; // bp
  splash: number; // bp
  penetration: number; // bp
  evasion: number; // bp
  /** Evasion that applies only vs air/flak fire (v3 US1d Chaff); omitted when zero. */
  evasionVsAir?: number; // bp
  armorPct: number; // bp
  critChance: number; // bp
  moveSpeed: number; // zone-transition steps (may be negative)
  targetDraw: number; // i8 — v3 US3: Decoy/Taunt +2 pulls fire, ECM −2 sheds it (feeds the priority chain)
  cadenceTier: CadenceTier | null;
  reach: ReachTag | null;
}

/** A shield's three coupled numbers, as deltas a defense contributes (`ShieldDelta`). */
export interface ShieldDelta {
  cap: number; // milli
  regen: number; // milli
  delay: number; // ticks (may be negative)
}

/** A targeted mitigation special (`MitigationMod`; e.g. Blast Plating −40% Explosive splash taken). */
export interface MitigationMod {
  against: DamageType;
  splashTakenMult: number; // bp
}

/** What a passive aura modifies (`AuraKind`). The per-tick auras apply only while the source lives. */
export type AuraKind =
  | 'DamageDealt'
  | 'CommandBoost'
  | 'StartShield'
  | 'DamageTaken'
  | 'Accuracy'; // Spotter Network zone-accuracy aura (v3 US3)

/** Who an aura reaches (`AuraScope`). */
export type AuraScope = 'ZoneAllies' | 'AllAllies';

/**
 * A passive zone/army aura a chassis projects (`AuraEffect`) — e.g. the Command Post's army-wide
 * `CommandBoost`, Bulwark's `DamageTaken` protection. The offensive/defensive auras apply only while
 * the source lives (v3 US5 — killing a Commander revokes its buff on the spot).
 */
export interface AuraEffect {
  kind: AuraKind;
  magnitude: number; // signed bp (e.g. -800 = −8%)
  scope: AuraScope;
}

// --- Base stats + type/variant identity ------------------------------------

/** A variant's fixed base-stat identity (`BaseStats`). `Fixed` fields are raw milli integers. */
export interface BaseStats {
  hull: number; // milli
  armorPct: number; // bp
  shieldCap: number; // milli
  shieldRegen: number; // milli
  shieldDelay: number; // ticks
  damage: number; // milli
  damageType: DamageType;
  cadence: CadenceTier;
  accuracy: number; // bp
  critChance: number; // bp
  critMult: number; // bp
  splash: number; // bp
  penetration: number; // bp
  reach: ReachTag;
  /** `null` = air-locked (heli); `0` = immobile; `n` = mobile. */
  moveSpeed: number | null;
  evasion: number; // bp
  threat: number; // milli
  supportPower?: number; // milli (support class only; omitted otherwise)
  supportRange?: SupportRange;
}

/** One of the seven unit classes (`MachineType`) — identity a variant cannot change. */
export interface MachineType {
  id: MachineTypeId;
  /** The native family; **omitted** (`undefined`) for the generalist Mech, which never earns the bonus. */
  nativeFamily?: DamageFamily;
  homeZones: ZoneId[];
  mountClass: MountClass;
  slotLayout: SlotLayout;
  canFireFromRear: boolean;
  airCapableByDefault: boolean;
}

/** A chassis variant identity (`ChassisVariant`) — its numbers live in {@link Ruleset.variants}. */
export interface ChassisVariant {
  id: string;
  typeId: MachineTypeId;
  /** Raises utility slots for the odd variant (Sentinel, Command Post → 4). */
  slotLayoutOverride?: SlotLayout;
  passiveAura?: AuraEffect;
}

// --- Equipment (kind-tagged union, flattened id/name) ----------------------

/** A weapon module's spec fields (`WeaponSpec`). */
export interface WeaponSpec {
  mountClass: MountClass;
  family: DamageFamily;
  statDeltas: StatDeltas;
  /** Projector support (v3 US5): when present, this weapon projects support onto allies (the Commander's
   * weapon-driven counter-pick) instead of dealing damage. Absent on every ordinary weapon. */
  support?: SupportProjection;
}

/** A projector weapon's support payload (`SupportProjection`) — what a Commander projects and how far. */
export interface SupportProjection {
  power: number; // milli — per-tick hull healed / shield restored / ablative granted
  range: SupportRange;
  kind: SupportKind;
}

/** An ablative pool a defense grants (`AblativeDelta`) — one-time, non-regenerating absorption (v2). */
export interface AblativeDelta {
  cap: number; // milli
}

/** A defense module's spec fields (`DefenseSpec`). */
export interface DefenseSpec {
  mountClass: MountClass;
  armorPctDelta: number; // bp
  shieldDelta?: ShieldDelta;
  ablativeDelta?: AblativeDelta;
  specialMitigation?: MitigationMod;
  /** Reactive plating (v2, Mech-exclusive) — mitigation adapts toward the family absorbed most.
   *  Omitted (false) on every ordinary defense so a pre-v2 ruleset hashes identically. */
  reactive?: boolean;
  tradeoff: StatDeltas;
}

/** A utility module's spec fields (`UtilitySpec`). */
export interface UtilitySpec {
  statDeltas?: StatDeltas;
  unlocks: Capability[];
  cadenceShift: number;
  /** Slot cost (v3 US3-A): budget points this utility consumes (1/2/3). Omitted (⇒ 1) for single-cost
   *  items, matching the Rust `#[serde(default, skip_serializing_if = 1)]`. */
  cost?: number;
}

/**
 * An equipment module (`EquipmentModule`) — a `kind`-tagged union with `id`/`name` flattened
 * alongside the spec fields, matching `#[serde(tag = "kind", flatten)]`.
 */
export type EquipmentModule =
  | ({ kind: 'Weapon'; id: string; name: string } & WeaponSpec)
  | ({ kind: 'Defense'; id: string; name: string } & DefenseSpec)
  | ({ kind: 'Utility'; id: string; name: string } & UtilitySpec);

// --- Tier-2 tables the derivation does not read directly (typed for completeness) ---

/** One damage type's multipliers vs each defense layer (`LayerMultipliers`, bp). */
export interface LayerMultipliers {
  vsShields: number;
  vsArmor: number;
}

/** The damage-type × defense-layer matrix (`DamageMatrix`). */
export interface DamageMatrix {
  kinetic: LayerMultipliers;
  energy: LayerMultipliers;
  explosive: LayerMultipliers;
}

/** Ticks between shots per cadence tier (`CadenceTicks`). */
export interface CadenceTicks {
  fast: number;
  medium: number;
  slow: number;
  siege: number;
}

/** A per-attacker-type damage bonus vs a set of target machine types (`RoleDamageBonus`, "role counter"). */
export interface RoleDamageBonus {
  vs: MachineTypeId[];
  mult: number; // bp — additive (5000 = +50%)
}

/** Air-combat modifiers (`AirModifiers`, bp). */
export interface AirModifiers {
  aaAccBonus: number;
  aaDmgMult: number;
  plinkAccPenalty: number;
  /** Non-AA weapon plinking air (dogfights) — air-to-air damage multiplier. */
  plinkDmgMult: number;
  /** SAM (Air-reach) suppressing ground — damage multiplier, split from `plinkDmgMult`. */
  samGroundDmgMult: number;
  /** Flak platform (`AntiAir` capability) firing on air — damage multiplier; omitted at the ×1.0 default. */
  flakDmgMult?: number;
  /**
   * Anti-air fire discipline: how many attackers may engage each living enemy aircraft per tick.
   * Without it, one cheap aircraft monopolises an entire air-defence network. Omitted at the
   * default (2).
   */
  aaFocusPerAir?: number;
  /**
   * Energy weapons contest air (v2, staged US4): a ground energy weapon engaging air deals damage at
   * this rate, meant to sit strictly between `plinkDmgMult` and `flakDmgMult`. `0` (the default,
   * omitted) disables the mechanic — energy weapons can neither reach nor hit air.
   */
  energyAirDmgMult?: number;
}

/** Ablative-defense tuning (`AblativeMods`, v2). Only the save chance is a knob; sizing is per-module. */
export interface AblativeMods {
  saveChance: number; // bp — chance a hit does NOT deplete the pool
}

/** The engine's `AblativeMods::default()`, mirrored for when a stored ruleset omits the field. */
export const DEFAULT_ABLATIVE_MODS: AblativeMods = { saveChance: 2000 };

/**
 * Per-mount-class defensive magnitude scaling (`MountScale`, v2) — the single knob that redistributes
 * how much survivability each mount gets from the same defense module. Applied at derive time to
 * armor %, shield pool, and ablative pool alike.
 */
export interface MountScale {
  heavy: number; // bp
  light: number;
  mech: number;
  heli: number;
  rktArty: number;
  artillery: number;
  support: number;
}

/**
 * Stance output/resilience modifiers (`StanceMods`, v3 US4) — the two-sided magnitude the stance dial
 * applies. `Aggressive` trades survivability for output; `Defensive` the reverse; `Neutral` is
 * identity. Read live on each hit in the engine, so a Plan-B stance flip takes effect at once.
 */
export interface StanceMods {
  aggressiveOutput: number; // bp — outgoing damage/projection mult (10500 = +5%)
  aggressiveAccuracy: number; // bp — additive accuracy (500 = +5%)
  aggressiveTaken: number; // bp — incoming-damage mult (11000 = +10% taken)
  defensiveOutput: number; // bp — outgoing damage/projection mult (8000 = −20%)
  defensiveTaken: number; // bp — incoming-damage mult (9500 = −5% taken)
  defensiveEvasion: number; // bp — additive evasion (500 = +5%)
}

/** The engine's `StanceMods::default()`, mirrored for when a stored ruleset omits the field. */
export const DEFAULT_STANCE_MODS: StanceMods = {
  aggressiveOutput: 10500,
  aggressiveAccuracy: 500,
  aggressiveTaken: 11000,
  defensiveOutput: 8000,
  defensiveTaken: 9500,
  defensiveEvasion: 500,
};

/** What counts as "identical" for coordination (`CoordinationGrain`, spec 014). */
export type CoordinationGrain = 'Type' | 'TypeVariant';

/** Which derived stats the coordination factor scales (`CoordinationScales`, spec 014). */
export type CoordinationScales = 'Offense' | 'OffenseAndSurvivability';

/**
 * Coordination (`Coordination`, spec 014) — diminishing returns on the Nth identical unit, applied at
 * army-build time (never in per-machine derive). Identity by default (every unit ×1.0), omitted from
 * serialization at the identity curve. `returns[0]` is always 10000; an index past the end clamps.
 */
export interface Coordination {
  returns: number[]; // bp per duplicate rank
  grain: CoordinationGrain;
  scales: CoordinationScales;
}

/** The engine's `Coordination::default()` (identity) — every unit at full effectiveness. */
export const DEFAULT_COORDINATION: Coordination = {
  returns: [10000],
  grain: 'Type',
  scales: 'Offense',
};

/** Reactive plating (`ReactiveMods`, v2, Mech) — the rate applied to the dominant absorbed family. */
export interface ReactiveMods {
  rate: number; // bp — damage multiplier vs the dominant absorbed family (8000 = ×0.8)
}

/** The engine's `ReactiveMods::default()`, mirrored for when a stored ruleset omits the field. */
export const DEFAULT_REACTIVE_MODS: ReactiveMods = { rate: 8000 };

/** The engine's `MountScale::default()`, mirrored for when a stored ruleset omits the field. */
export const DEFAULT_MOUNT_SCALE: MountScale = {
  heavy: 10000,
  light: 8000,
  mech: 10000,
  heli: 6000,
  rktArty: 7000,
  artillery: 7000,
  support: 9000,
};

/** Fire cadence welded to damage type (v3 US1c, design §D6). Mirrors the engine `CadenceProfile`. */
export interface CadenceProfile {
  energy: CadenceTier;
  kinetic: CadenceTier;
  explosive: CadenceTier;
  /** Extra outgoing damage (bp) for the heavy-platform chassis (Heavy Tank, Mech). 1000 = +10%. */
  heavyPlatformDmgBonus: number;
}

/** The engine default (omitted from a ruleset at rest, so absence ⇒ this). */
export const DEFAULT_CADENCE_PROFILE: CadenceProfile = {
  energy: 'Fast',
  kinetic: 'Medium',
  explosive: 'Slow',
  heavyPlatformDmgBonus: 1000,
};

/** The mount-scale factor (bp) for a mount class, from a ruleset's table or the default. */
export function mountScaleFor(scale: MountScale, mount: MountClass): number {
  switch (mount) {
    case 'Heavy':
      return scale.heavy;
    case 'Light':
      return scale.light;
    case 'Mech':
      return scale.mech;
    case 'Heli':
      return scale.heli;
    case 'RktArty':
      return scale.rktArty;
    case 'Artillery':
      return scale.artillery;
    case 'Support':
      return scale.support;
  }
}

/** Global combat coefficients + tick budget (`GlobalConstants`). The derivation reads `splashCap`. */
export interface GlobalConstants {
  tickRate: number;
  tickCap: number;
  damageVariance: number;
  critBaseChance: number;
  critBaseMult: number;
  nativeBonus: number;
  minDamageFloor: number;
  splashCap: number; // bp — the derivation's splash clamp ceiling
  hitClampMin: number;
  hitClampMax: number;
}

/**
 * The engine's balance table + content catalog (`Ruleset`) — the concrete shape the client
 * derivation/validation read (supersedes the opaque `Ruleset` in `sim/model.ts`, re-exported there
 * for the persistence layer). Maps are id-keyed objects (deterministic ordered iteration in Rust).
 */
export interface Ruleset {
  machineTypes: Record<string, MachineType>;
  chassis: Record<string, ChassisVariant>;
  variants: Record<string, BaseStats>;
  equipment: Record<string, EquipmentModule>;
  damageMatrix: DamageMatrix;
  cadenceTicks: CadenceTicks;
  airMods: AirModifiers;
  globals: GlobalConstants;
  /** Per-attacker-type role-counter bonuses; omitted when empty. */
  roleDamageBonuses?: Record<string, RoleDamageBonus>;
  /** Ablative save chance; omitted at the default ({@link DEFAULT_ABLATIVE_MODS}). */
  ablativeMods?: AblativeMods;
  /** Per-mount defensive scaling; omitted at the default ({@link DEFAULT_MOUNT_SCALE}). */
  mountScale?: MountScale;
  /** Stance output/resilience modifiers (v3); omitted at the default ({@link DEFAULT_STANCE_MODS}). */
  stanceMods?: StanceMods;
  /** Reactive plating's mitigation rate; omitted at the default ({@link DEFAULT_REACTIVE_MODS}). */
  reactiveMods?: ReactiveMods;
  /** Coordination diminishing-returns curve (spec 014); omitted at the identity default. */
  coordination?: Coordination;
  /** Cadence welded to damage type (v3 US1c); omitted at the default ({@link DEFAULT_CADENCE_PROFILE}). */
  cadenceProfile?: CadenceProfile;
}

// --- Derived output --------------------------------------------------------

/**
 * The combat-ready stat block (`EffectiveStats`) — the derived truth the tick loop reads and the
 * Garage previews. Integer/enum only; `Fixed` fields are raw milli integers. `capabilities` is a
 * set serialized in {@link CAPABILITY_ORDER}.
 */
export interface EffectiveStats {
  hull: number; // milli
  armorPct: number; // bp
  shieldCap: number; // milli
  shieldRegen: number; // milli
  shieldDelay: number; // ticks
  ablativeCap: number; // milli — v2 one-time non-regenerating pool (0 when no ablative defense)
  reactive: boolean; // v2 — true only for the Mech's reactive plating; drives adaptive mitigation
  damage: number; // milli
  damageType: DamageType;
  family: DamageFamily;
  nativeMatch: boolean;
  cadence: CadenceTier;
  accuracy: number; // bp
  critChance: number; // bp
  critMult: number; // bp
  splash: number; // bp
  penetration: number; // bp
  reach: ReachTag;
  canTargetAir: boolean;
  moveSpeed: number | null;
  evasion: number; // bp
  evasionVsAir: number; // bp — extra evasion vs air/flak fire only (v3 US1d Chaff)
  threat: number; // milli
  targetDraw: number; // i8 — v3 US2/US3 priority-score draw offset (Decoy +2 / ECM −2)
  supportPower: number | null;
  supportRange: SupportRange | null;
  /** What this machine projects (v3 US5): `Heal` for the medic, or the Commander's weapon-chosen
   * `ShieldBoost` / `Ablation`. `Heal` whenever there is no support power (the harmless default). */
  supportKind: SupportKind;
  specialMitigation: MitigationMod | null;
  capabilities: Capability[];
  planBSlots: number;
}

/**
 * A structural derivation fault (`DerivationError`) — a referenced id is absent or a slot holds the
 * wrong kind. Externally tagged, matching the engine's serde output (the richer V1–V8 legality rules
 * are {@link validateArmy}'s job).
 */
export type DerivationError =
  | { UnknownMachineType: MachineTypeId }
  | { UnknownVariant: string }
  | { UnknownEquipment: string }
  | { WrongSlotKind: { id: string; expected: SlotKind } };
