/**
 * The mount/family-gated equipment candidates for a machine (US2, FR-006) — the **legal** weapon /
 * defense / utility choices the loadout editor offers, so an illegal mount is never presented rather
 * than rejected after the fact ([research B1]). Derived from the ruleset, so the options are exactly
 * what the engine's V4 would accept. Pure; unit-tested.
 */

import type { MachineTypeId } from '@/sim/model';
import type { Capability, EquipmentModule, Ruleset, StatDeltas } from '@/sim/ruleset';

/** A weapon module (the `kind: "Weapon"` arm of the union). */
export type WeaponModule = Extract<EquipmentModule, { kind: 'Weapon' }>;
/** A defense module. */
export type DefenseModule = Extract<EquipmentModule, { kind: 'Defense' }>;
/** A utility module. */
export type UtilityModule = Extract<EquipmentModule, { kind: 'Utility' }>;

/** All equipment in the ruleset's deterministic (id-sorted) order. */
function equipment(ruleset: Ruleset): EquipmentModule[] {
  return Object.values(ruleset.equipment);
}

/**
 * Capabilities the engine **derives but does not act on** — a mechanic present in the data model with
 * no gameplay effect. Today the only one is `ExtendReach`: the engine deepens `Nearest → FrontMid`, but
 * targeting treats those identically (and no weapon starts at `FrontMid`), so it changes nothing. Keep
 * in step with the engine derivation (`crates/engine/src/model/army.rs`).
 */
const INERT_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(['ExtendReach']);

/** Any non-zero numeric delta, or a reach / cadence override — i.e. a real derived-stat change. */
function hasStatEffect(d: StatDeltas | undefined): boolean {
  if (!d) return false;
  return Object.values(d).some((v) => (typeof v === 'number' ? v !== 0 : v != null));
}

/**
 * A utility with **no effect the engine acts on**: its sole contribution is an {@link INERT_CAPABILITIES
 * inert capability}, with no stat delta, aura, or cadence shift. Such equipment is hidden from the
 * pickers ({@link utilityOptions}) — a player is never offered gear that does nothing. It stays in the
 * ruleset (so a squad that already fielded it remains legal); it is only removed from the *choices*.
 */
export function isInertUtility(u: UtilityModule): boolean {
  return (
    u.unlocks.length > 0 &&
    u.unlocks.every((c) => INERT_CAPABILITIES.has(c)) &&
    !u.aura &&
    (u.cadenceShift ?? 0) === 0 &&
    !hasStatEffect(u.statDeltas)
  );
}

/** The mount class a machine type fits (gates weapons + defenses, V4). */
export function mountClassFor(typeId: MachineTypeId, ruleset: Ruleset) {
  return ruleset.machineTypes[typeId]?.mountClass;
}

/**
 * The weapons a machine may mount — **every** family that fits its mount class (the family crossover
 * that makes an off-native weapon a legal *sidegrade*, P1), not just the native one.
 */
export function weaponOptions(typeId: MachineTypeId, ruleset: Ruleset): WeaponModule[] {
  const mount = mountClassFor(typeId, ruleset);
  return equipment(ruleset).filter(
    (m): m is WeaponModule => m.kind === 'Weapon' && m.mountClass === mount,
  );
}

/** The defenses a machine may mount (same mount class, V4). */
export function defenseOptions(typeId: MachineTypeId, ruleset: Ruleset): DefenseModule[] {
  const mount = mountClassFor(typeId, ruleset);
  return equipment(ruleset).filter(
    (m): m is DefenseModule => m.kind === 'Defense' && m.mountClass === mount,
  );
}

/**
 * The utilities a machine may equip — gated by the §14 chassis rule (mirrors the engine's V5 gate):
 * a utility with a non-empty `mountClasses` only fits a chassis whose mount class it lists; an
 * absent/empty list is the common pool (any chassis). Dedup across slots is still enforced separately.
 */
export function utilityOptions(typeId: MachineTypeId, ruleset: Ruleset): UtilityModule[] {
  const mount = mountClassFor(typeId, ruleset);
  return equipment(ruleset).filter(
    (m): m is UtilityModule =>
      m.kind === 'Utility' &&
      // Never offer a utility the engine doesn't act on (e.g. Rangefinder / Target Radar — Extend Reach).
      !isInertUtility(m) &&
      (!m.mountClasses ||
        m.mountClasses.length === 0 ||
        (mount !== undefined && m.mountClasses.includes(mount))),
  );
}

/**
 * Whether a weapon earns the type's **native-family bonus** — its family matches the type's native
 * family (the generalist Mech has none, so it always sidegrades). Surfaces the P1 "trade-off, never a
 * strict upgrade" in the picker.
 */
export function isNativeWeapon(
  typeId: MachineTypeId,
  weapon: WeaponModule,
  ruleset: Ruleset,
): boolean {
  const native = ruleset.machineTypes[typeId]?.nativeFamily;
  return native !== undefined && native === weapon.family;
}
