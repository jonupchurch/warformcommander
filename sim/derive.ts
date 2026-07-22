/**
 * The **pure, browser-safe** effective-stat derivation — a faithful TypeScript port of the engine's
 * `derive_effective_stats` (`crates/engine/src/model/army.rs`). The client cannot run the wasm engine
 * (constitution P6), so the Garage's live preview + edit-time gating derive here; the parity fixture
 * (`tests/fixtures/derive-battery.json`) pins this to the engine byte-for-byte (Feature 4 T006,
 * SC-002, P8 — one derivation shared by engine/server/Garage, never a Garage-local formula).
 *
 * **Arithmetic contract**: every stat is an integer (`Fixed` = milli-units; `Bp` = basis points).
 * The derivation is additive-over-chassis with clamps + cadence/reach overrides — no division — so
 * plain JS integer arithmetic reproduces the fixed-point engine exactly (values stay well under 2^53).
 */

import type { Army, Loadout, MachineInstance } from './model';

/**
 * The fields the derivation actually reads — `type + variant + equipment`. A `MachineInstance`
 * satisfies it, and so does the Garage's `DraftMachine` (no `instanceId`/`zone`/`dials` needed), so
 * the live preview can derive an in-progress machine directly.
 */
export type DerivableMachine = Pick<MachineInstance, 'typeId' | 'variantId' | 'loadout'>;
import {
  CAPABILITY_ORDER,
  DEFAULT_MOUNT_SCALE,
  mountScaleFor,
  type CadenceTier,
  type Capability,
  type DamageFamily,
  type DamageType,
  type DefenseSpec,
  type DerivationError,
  type EffectiveStats,
  type ReachTag,
  type Ruleset,
  type StatDeltas,
  type UtilitySpec,
  type WeaponSpec,
} from './ruleset';

/** `Fixed` basis-point ceiling (`BP_ONE`) — `1.0` = 10 000 bp. */
const BP_ONE = 10_000;
/** `u16::MAX` — the shield-delay clamp ceiling (matching the Rust cast). */
const U16_MAX = 65_535;
/** `u8::MAX` — the move-speed clamp ceiling. */
const U8_MAX = 255;

/** The result of a derivation: the stats, or a structural fault (matching the Rust `Result`). */
export type DeriveResult =
  | { ok: true; stats: EffectiveStats }
  | { ok: false; error: DerivationError };

/** Integer clamp into `[lo, hi]` (matches Rust `i32::clamp`). */
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

/** One cadence tier faster, saturating at `Fast` (Autoloader). */
function faster(t: CadenceTier): CadenceTier {
  switch (t) {
    case 'Fast':
    case 'Medium':
      return 'Fast';
    case 'Slow':
      return 'Medium';
    case 'Siege':
      return 'Slow';
  }
}

/** One cadence tier slower, saturating at `Siege`. */
function slower(t: CadenceTier): CadenceTier {
  switch (t) {
    case 'Fast':
      return 'Medium';
    case 'Medium':
      return 'Slow';
    case 'Slow':
    case 'Siege':
      return 'Siege';
  }
}

/** One reach step deeper (Rangefinder "+1 zone"): `Nearest → FrontMid → AnyGround`; others unchanged. */
function deepen(reach: ReachTag): ReachTag {
  if (reach === 'Nearest') return 'FrontMid';
  if (reach === 'FrontMid') return 'AnyGround';
  return reach;
}

/** The matrix damage type a family deals, or `undefined` for `Support`. */
function asDamageType(family: DamageFamily): DamageType | undefined {
  switch (family) {
    case 'Kinetic':
      return 'Kinetic';
    case 'Energy':
      return 'Energy';
    case 'Explosive':
      return 'Explosive';
    case 'Support':
      return undefined;
  }
}

/** The additive accumulator (mirror of the Rust `Accum`) — one place to fold each module's deltas. */
interface Accum {
  damage: number;
  accuracy: number;
  evasion: number;
  armorPct: number;
  critChance: number;
  splash: number;
  penetration: number;
  moveDelta: number;
  cadence: CadenceTier;
  reach: ReachTag;
}

/** Apply one module's deltas: additive everywhere; `cadenceTier`/`reach` override when non-null. */
function applyDeltas(acc: Accum, d: StatDeltas): void {
  acc.damage += d.damage;
  acc.accuracy += d.accuracy;
  acc.evasion += d.evasion;
  acc.armorPct += d.armorPct;
  acc.critChance += d.critChance;
  acc.splash += d.splash;
  acc.penetration += d.penetration;
  acc.moveDelta += d.moveSpeed;
  if (d.cadenceTier !== null) acc.cadence = d.cadenceTier;
  if (d.reach !== null) acc.reach = d.reach;
}

type Lookup<T> = { ok: true; spec: T } | { ok: false; error: DerivationError };

function lookupWeapon(ruleset: Ruleset, id: string): Lookup<WeaponSpec> {
  const m = ruleset.equipment[id];
  if (!m) return { ok: false, error: { UnknownEquipment: id } };
  if (m.kind !== 'Weapon') return { ok: false, error: { WrongSlotKind: { id, expected: 'Weapon' } } };
  return { ok: true, spec: m };
}

function lookupDefense(ruleset: Ruleset, id: string): Lookup<DefenseSpec> {
  const m = ruleset.equipment[id];
  if (!m) return { ok: false, error: { UnknownEquipment: id } };
  if (m.kind !== 'Defense')
    return { ok: false, error: { WrongSlotKind: { id, expected: 'Defense' } } };
  return { ok: true, spec: m };
}

function lookupUtility(ruleset: Ruleset, id: string): Lookup<UtilitySpec> {
  const m = ruleset.equipment[id];
  if (!m) return { ok: false, error: { UnknownEquipment: id } };
  if (m.kind !== 'Utility')
    return { ok: false, error: { WrongSlotKind: { id, expected: 'Utility' } } };
  return { ok: true, spec: m };
}

/** Sort a capability set into the engine's canonical (declaration) order. */
function sortCapabilities(caps: Set<Capability>): Capability[] {
  return CAPABILITY_ORDER.filter((c) => caps.has(c));
}

/**
 * Derive a machine's combat-ready {@link EffectiveStats} from `type + variant + equipment` against
 * the {@link Ruleset} — the shared, pure derivation (FR-007). Returns a structural
 * {@link DerivationError} (rather than throwing) on a broken build, matching the engine.
 */
export function deriveEffectiveStats(machine: DerivableMachine, ruleset: Ruleset): DeriveResult {
  const base = ruleset.variants[machine.variantId];
  if (!base) return { ok: false, error: { UnknownVariant: machine.variantId } };
  const mtype = ruleset.machineTypes[machine.typeId];
  if (!mtype) return { ok: false, error: { UnknownMachineType: machine.typeId } };

  // Start every additive axis from the chassis base.
  const acc: Accum = {
    damage: base.damage,
    accuracy: base.accuracy,
    evasion: base.evasion,
    armorPct: base.armorPct,
    critChance: base.critChance,
    splash: base.splash,
    penetration: base.penetration,
    moveDelta: 0,
    cadence: base.cadence,
    reach: base.reach,
  };
  const caps = new Set<Capability>();
  let cadenceShift = 0;

  // --- Weapon (defines the gun's family; deltas relative to the chassis) ---
  const weapon = lookupWeapon(ruleset, machine.loadout.weapon);
  if (!weapon.ok) return weapon;
  applyDeltas(acc, weapon.spec.statDeltas);
  const family = weapon.spec.family;

  // --- Defense (armor/shield/ablative layer + its tradeoff cost) ---
  // Defensive magnitudes scale by mount class (v2): armor %, shield pool, and ablative pool alike, so
  // one mount-scale table redistributes how much each mount gets from the same module. Mirrors
  // `derive_effective_stats` in crates/engine/src/model/army.rs.
  const defense = lookupDefense(ruleset, machine.loadout.defense);
  if (!defense.ok) return defense;
  const scale = mountScaleFor(ruleset.mountScale ?? DEFAULT_MOUNT_SCALE, defense.spec.mountClass);
  const scaleBp = (v: number): number => Math.trunc((v * scale) / BP_ONE);
  acc.armorPct += scaleBp(defense.spec.armorPctDelta);
  applyDeltas(acc, defense.spec.tradeoff);
  const s = defense.spec.shieldDelta;
  const shieldCap = s ? base.shieldCap + scaleBp(s.cap) : base.shieldCap;
  const shieldRegen = s ? base.shieldRegen + s.regen : base.shieldRegen;
  const shieldDelay = s ? clamp(base.shieldDelay + s.delay, 0, U16_MAX) : base.shieldDelay;
  const ablativeCap = defense.spec.ablativeDelta ? scaleBp(defense.spec.ablativeDelta.cap) : 0;
  const specialMitigation = defense.spec.specialMitigation ?? null;
  const reactive = defense.spec.reactive ?? false;

  // --- Utilities (additive deltas + capability unlocks + cadence shifts) ---
  for (const uid of machine.loadout.utilities) {
    const util = lookupUtility(ruleset, uid);
    if (!util.ok) return util;
    if (util.spec.statDeltas) applyDeltas(acc, util.spec.statDeltas);
    for (const cap of util.spec.unlocks) caps.add(cap);
    cadenceShift += util.spec.cadenceShift;
  }

  // Native behavioural flexibility (v2, FR-025): the Mech — the sole generalist (no native family) —
  // natively carries the extra Plan-B slot other chassis buy with Combat AI. Mirrors the engine.
  if (mtype.nativeFamily === undefined) caps.add('ExtraPlanBSlot');

  // Resolve cadence shifts (positive = faster, saturating at the tier ends).
  let cadence = acc.cadence;
  for (let i = 0; i < Math.max(cadenceShift, 0); i++) cadence = faster(cadence);
  for (let i = 0; i < Math.max(-cadenceShift, 0); i++) cadence = slower(cadence);

  // Reach: Rangefinder deepens; splash caps; penetration/armor/evasion clamp to sane ranges.
  const reach = caps.has('ExtendReach') ? deepen(acc.reach) : acc.reach;
  const splash = clamp(acc.splash, 0, ruleset.globals.splashCap);
  const penetration = clamp(acc.penetration, 0, BP_ONE);
  const armorPct = clamp(acc.armorPct, 0, BP_ONE);
  const evasion = clamp(acc.evasion, 0, BP_ONE);

  // Mobility: air-locked (base null) stays null; otherwise clamp the delta at zero.
  const moveSpeed = base.moveSpeed === null ? null : clamp(base.moveSpeed + acc.moveDelta, 0, U8_MAX);

  const nativeMatch = mtype.nativeFamily === family;
  const damageType = asDamageType(family) ?? base.damageType;
  const canTargetAir =
    mtype.airCapableByDefault || caps.has('TargetAir') || caps.has('AntiAir') || reach === 'Air';
  const planBSlots = 1 + (caps.has('ExtraPlanBSlot') ? 1 : 0);

  return {
    ok: true,
    stats: {
      hull: base.hull,
      armorPct,
      shieldCap,
      shieldRegen,
      shieldDelay,
      ablativeCap,
      reactive,
      damage: Math.max(acc.damage, 0),
      damageType,
      family,
      nativeMatch,
      cadence,
      accuracy: acc.accuracy,
      critChance: acc.critChance,
      critMult: base.critMult,
      splash,
      penetration,
      reach,
      canTargetAir,
      moveSpeed,
      evasion,
      threat: base.threat,
      supportPower: base.supportPower ?? null,
      supportRange: base.supportRange ?? null,
      specialMitigation,
      capabilities: sortCapabilities(caps),
      planBSlots,
    },
  };
}

/**
 * The capabilities a loadout's utilities unlock (the same set {@link deriveEffectiveStats} computes),
 * in canonical order — for gating advanced dials / Plan-B slots in the editor without a full derive
 * (V6/V7). Unknown/non-utility ids contribute nothing (the full derive surfaces the structural fault).
 */
export function unlockedCapabilities(loadout: Loadout, ruleset: Ruleset): Capability[] {
  const caps = new Set<Capability>();
  for (const uid of loadout.utilities) {
    const m = ruleset.equipment[uid];
    if (m && m.kind === 'Utility') for (const cap of m.unlocks) caps.add(cap);
  }
  return sortCapabilities(caps);
}

/**
 * A machine's coarse, **matchmaking-only** power rating (`power_rating`) in milli-units:
 * `hull + shieldCap + damage`. Never touches combat math (FR-006).
 */
export function powerRating(stats: EffectiveStats): number {
  return stats.hull + stats.shieldCap + stats.damage;
}

/**
 * The army's matchmaking power rating in **whole units** — the sum of per-machine {@link powerRating}
 * (milli), truncated toward zero once at the end (mirrors the engine's `army_power_rating`). Returns
 * `0` if any machine fails to derive (matching the server's `unwrap_or(0)`).
 */
export function armyPowerRating(army: Army, ruleset: Ruleset): number {
  let totalMilli = 0;
  for (const m of army.machines) {
    const r = deriveEffectiveStats(m, ruleset);
    if (!r.ok) return 0;
    totalMilli += powerRating(r.stats);
  }
  return Math.trunc(totalMilli / 1000);
}
