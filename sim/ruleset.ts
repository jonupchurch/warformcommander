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

/** A support unit's reach for heals/auras (`SupportRange`). */
export type SupportRange = 'OwnZone' | 'OwnPlusAdjacent';

/**
 * A capability an equipped utility unlocks (`Capability`) — gates advanced dials / Plan-B / reach /
 * air (V6/V7). **Declaration order is significant**: the engine emits `capabilities` as a sorted
 * set in this order (see {@link CAPABILITY_ORDER}).
 */
export type Capability =
  | 'ExtraPlanBSlot'
  | 'AdaptiveEnergy'
  | 'OpportunistStance'
  | 'ExtendReach'
  | 'TargetAir'
  | 'AntiAir';

/** The canonical `Capability` sort order (the Rust enum's `Ord` / declaration order). */
export const CAPABILITY_ORDER: readonly Capability[] = [
  'ExtraPlanBSlot',
  'AdaptiveEnergy',
  'OpportunistStance',
  'ExtendReach',
  'TargetAir',
  'AntiAir',
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
  armorPct: number; // bp
  critChance: number; // bp
  moveSpeed: number; // zone-transition steps (may be negative)
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
  passiveAura?: unknown;
}

// --- Equipment (kind-tagged union, flattened id/name) ----------------------

/** A weapon module's spec fields (`WeaponSpec`). */
export interface WeaponSpec {
  mountClass: MountClass;
  family: DamageFamily;
  statDeltas: StatDeltas;
}

/** A defense module's spec fields (`DefenseSpec`). */
export interface DefenseSpec {
  mountClass: MountClass;
  armorPctDelta: number; // bp
  shieldDelta?: ShieldDelta;
  specialMitigation?: MitigationMod;
  tradeoff: StatDeltas;
}

/** A utility module's spec fields (`UtilitySpec`). */
export interface UtilitySpec {
  statDeltas?: StatDeltas;
  unlocks: Capability[];
  cadenceShift: number;
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
}

/** One energy mode's two-sided trade (`EnergyProfile`, bp; `10000` = ×1.0). */
export interface EnergyProfile {
  /** Outgoing damage multiplier for a machine firing in this mode. */
  damageDealt: number;
  /** Incoming damage multiplier for a machine *being hit* while in this mode. */
  damageTaken: number;
}

/** The energy dial's balance table (`EnergyModes`) — one profile per mode. */
export interface EnergyModes {
  overdrive: EnergyProfile;
  offense: EnergyProfile;
  balanced: EnergyProfile;
  adaptive: EnergyProfile;
  defense: EnergyProfile;
  fortify: EnergyProfile;
}

/**
 * The engine's `EnergyModes::default()`, mirrored for display when a stored ruleset omits the field
 * (it is `skip_serializing_if` at the default, so rows saved before it existed carry no `energyModes`
 * and the engine fills these in). Keep in step with `crates/engine/src/model/ruleset.rs`.
 */
export const DEFAULT_ENERGY_MODES: EnergyModes = {
  overdrive: { damageDealt: 12000, damageTaken: 11000 },
  offense: { damageDealt: 11000, damageTaken: 10500 },
  balanced: { damageDealt: 10000, damageTaken: 10000 },
  adaptive: { damageDealt: 10000, damageTaken: 10000 },
  defense: { damageDealt: 9000, damageTaken: 9000 },
  fortify: { damageDealt: 8500, damageTaken: 8000 },
};

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
  /** The energy dial's dealt/taken table; omitted at the default ({@link DEFAULT_ENERGY_MODES}). */
  energyModes?: EnergyModes;
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
  threat: number; // milli
  supportPower: number | null;
  supportRange: SupportRange | null;
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
