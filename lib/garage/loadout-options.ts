/**
 * The mount/family-gated equipment candidates for a machine (US2, FR-006) — the **legal** weapon /
 * defense / utility choices the loadout editor offers, so an illegal mount is never presented rather
 * than rejected after the fact ([research B1]). Derived from the ruleset, so the options are exactly
 * what the engine's V4 would accept. Pure; unit-tested.
 */

import type { MachineTypeId } from '@/sim/model';
import type { EquipmentModule, Ruleset } from '@/sim/ruleset';

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
