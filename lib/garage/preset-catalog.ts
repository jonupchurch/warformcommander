/**
 * The stock-preset catalog + the canonical **default legal build** a newly-typed machine seeds from
 * (T010, FR-004, [research B3](../../specs/004-garage/research.md)). Presets here are **derived from
 * the ruleset** (never a hardcoded copy of the balance numbers, P8): a default picks the type's
 * native-family weapon, the identity defense for its mount, and the first utilities its slot layout
 * allows — a build guaranteed to pass `validate` for that variant, so a fresh squad is immediately
 * saveable (US1).
 *
 * The ruleset reaches the client via the Garage server component (it derives the default ruleset
 * through the wasm engine and passes it down); these functions take it as a parameter and stay pure.
 */

import type { BehaviorDials, EquipmentId, MachineTypeId, VariantId } from '@/sim/model';
import type { EquipmentModule, MountClass, Ruleset } from '@/sim/ruleset';

import type { MachineSeed } from './editor-reducer';

/** The canonical starter dials — all **starter** options, so no capability gate is tripped (V7/V8). */
export const STOCK_DIALS: BehaviorDials = {
  targetRow: 'FrontReachable',
  targetRule: 'FocusFire',
  energy: 'Balanced',
  movement: 'Hold',
  stance: 'Neutral',
};

/** A stock/custom preset — a named, type-scoped bundle of a machine's whole setup (§8.4, FR-005). */
export interface CatalogPreset {
  id: string;
  name: string;
  typeId: MachineTypeId;
  variantId: VariantId;
  seed: MachineSeed;
  origin: 'Stock' | 'Custom';
}

/** Equipment modules in the ruleset's deterministic (id-sorted) order. */
function equipmentList(ruleset: Ruleset): EquipmentModule[] {
  return Object.values(ruleset.equipment);
}

/** The default weapon for a mount: prefer the type's native family, else the first mount-legal one. */
function defaultWeapon(
  typeId: MachineTypeId,
  mount: MountClass,
  ruleset: Ruleset,
): EquipmentId {
  const nativeFamily = ruleset.machineTypes[typeId]?.nativeFamily;
  const weapons = equipmentList(ruleset).filter(
    (m) => m.kind === 'Weapon' && m.mountClass === mount,
  );
  const native = weapons.find((w) => w.kind === 'Weapon' && w.family === nativeFamily);
  const pick = native ?? weapons[0];
  if (!pick) throw new Error(`no ${mount}-mount weapon in the ruleset`);
  return pick.id;
}

/** The default defense for a mount: prefer the zero-cost identity hull, else the first mount-legal one. */
function defaultDefense(mount: MountClass, ruleset: Ruleset): EquipmentId {
  const defenses = equipmentList(ruleset).filter(
    (m) => m.kind === 'Defense' && m.mountClass === mount,
  );
  const identity = defenses.find(
    (d) => d.kind === 'Defense' && d.armorPctDelta === 0 && !d.shieldDelta && !d.specialMitigation,
  );
  const pick = identity ?? defenses[0];
  if (!pick) throw new Error(`no ${mount}-mount defense in the ruleset`);
  return pick.id;
}

/** The first `count` distinct utilities (ungated) — a legal fill for the slot layout. */
function defaultUtilities(count: number, ruleset: Ruleset): EquipmentId[] {
  const utils = equipmentList(ruleset)
    .filter((m) => m.kind === 'Utility')
    .map((u) => u.id);
  if (utils.length < count) throw new Error(`ruleset has ${utils.length} utilities; need ${count}`);
  return utils.slice(0, count);
}

/** The type's first home zone (heli → `Air`; ground → `Front`) — the default placement on `setType`. */
export function defaultZoneFor(typeId: MachineTypeId, ruleset: Ruleset) {
  const zones = ruleset.machineTypes[typeId]?.homeZones;
  if (!zones || zones.length === 0) throw new Error(`type ${typeId} has no home zones`);
  return zones[0];
}

/** The first variant of a machine type (the default selection when a slot's type is chosen). */
export function defaultVariantFor(typeId: MachineTypeId, ruleset: Ruleset): VariantId {
  const chassis = Object.values(ruleset.chassis).find((c) => c.typeId === typeId);
  if (!chassis) throw new Error(`no chassis variant for type ${typeId}`);
  return chassis.id;
}

/**
 * The canonical **default legal build** for a variant (FR-004): native-family weapon + identity
 * defense + the first utilities its slot layout allows + starter dials + no Plan-B. Guaranteed to
 * pass `validate` for that variant, so seeding a fresh machine yields an immediately-saveable squad.
 */
export function defaultFor(variantId: VariantId, ruleset: Ruleset): MachineSeed {
  const chassis = ruleset.chassis[variantId];
  if (!chassis) throw new Error(`unknown variant ${variantId}`);
  const typeId = chassis.typeId;
  const mtype = ruleset.machineTypes[typeId];
  if (!mtype) throw new Error(`unknown machine type ${typeId} for variant ${variantId}`);
  const mount = mtype.mountClass;
  const slots = chassis.slotLayoutOverride ?? mtype.slotLayout;
  return {
    variantId,
    loadout: {
      weapon: defaultWeapon(typeId, mount, ruleset),
      defense: defaultDefense(mount, ruleset),
      utilities: defaultUtilities(slots.utility, ruleset),
    },
    dials: STOCK_DIALS,
    planB: [],
  };
}

/**
 * The stock-preset catalog keyed by machine type — the default build of every variant, grouped by
 * its type. The on-ramp (US4) lists these so a player can field a coherent machine in a few taps.
 */
export function buildStockCatalog(ruleset: Ruleset): Record<string, CatalogPreset[]> {
  const catalog: Record<string, CatalogPreset[]> = {};
  for (const chassis of Object.values(ruleset.chassis)) {
    const preset: CatalogPreset = {
      id: `stock:${chassis.id}`,
      name: chassis.id,
      typeId: chassis.typeId,
      variantId: chassis.id,
      seed: defaultFor(chassis.id, ruleset),
      origin: 'Stock',
    };
    (catalog[chassis.typeId] ??= []).push(preset);
  }
  return catalog;
}
