/**
 * The presets on-ramp core (T032, US4) — the **pure**, ruleset-driven transforms that let a player
 * field a coherent machine in a few taps (SC-004) and reuse their own builds (FR-011/012/013). Kept
 * separate from React and from persistence so every rule is unit-testable (Principle VIII):
 *
 * - **Type scoping** (`presetsForType`): a custom preset is offered only to a machine of its own type
 *   — a different-type machine is never offered it (FR-013, AS3).
 * - **Slot fitting** (`fitUtilities` / `fitPresetToVariant`): a preset's utilities are truncated to
 *   the target variant's slot layout, so a 4-utility bundle **never pushes a 4th utility onto a
 *   3-slot variant** (FR-013, AS4). Weapon/defense need no remap — mount class is a property of the
 *   machine *type*, shared by all its variants.
 * - **Config extraction** (`toPresetConfig`): the reusable `loadout + dials + planB` a save-as-preset
 *   sends to Feature 7, minus the variant identity (a `PresetConfig` is per-type, §8.4).
 *
 * The ruleset arrives from the Garage server component (P6 — the client never runs wasm); these
 * functions take it as a parameter and hold no state.
 */

import type { EquipmentId, MachineTypeId, PresetConfig, VariantId, ZoneId } from '@/sim/model';
import type { Ruleset } from '@/sim/ruleset';

import type { MachineSeed } from './editor-reducer';
import { defaultVariantFor, defaultZoneFor, type CatalogPreset } from './preset-catalog';
import type { DraftMachine } from './types';

/** The utility-slot count of a variant (its override, else its type's default — usually 3, some 4). */
export function utilitySlots(variantId: VariantId, ruleset: Ruleset): number {
  const chassis = ruleset.chassis[variantId];
  if (!chassis) throw new Error(`unknown variant ${variantId}`);
  const mtype = ruleset.machineTypes[chassis.typeId];
  if (!mtype) throw new Error(`unknown machine type ${chassis.typeId} for variant ${variantId}`);
  return (chassis.slotLayoutOverride ?? mtype.slotLayout).utility;
}

/**
 * Fit a preset's utility list to `slotCount`: drop dupes and anything no longer a real utility,
 * **truncate** to the cap (never overfill — FR-013/AS4), then pad from the ruleset's ungated
 * utilities so the result is always a legal, full slot layout for the target variant.
 */
export function fitUtilities(
  utilities: EquipmentId[],
  slotCount: number,
  ruleset: Ruleset,
): EquipmentId[] {
  const seen = new Set<EquipmentId>();
  const kept: EquipmentId[] = [];
  for (const id of utilities) {
    if (kept.length >= slotCount) break; // truncate — a 4-util bundle can't fill 3 slots
    if (seen.has(id)) continue; // dedup (V5)
    if (ruleset.equipment[id]?.kind !== 'Utility') continue; // stale / non-utility id
    seen.add(id);
    kept.push(id);
  }
  if (kept.length < slotCount) {
    for (const mod of Object.values(ruleset.equipment)) {
      if (kept.length >= slotCount) break;
      if (mod.kind === 'Utility' && !seen.has(mod.id)) {
        seen.add(mod.id);
        kept.push(mod.id);
      }
    }
  }
  return kept;
}

/**
 * Fit a per-type preset bundle onto a specific target variant: keep its weapon/defense/dials/planB,
 * but re-fit the utilities to the target's slot layout (`fitUtilities`). Returns a {@link MachineSeed}
 * ready for the `applyPreset` reducer verb. Used when re-applying a **custom** preset — which carries
 * no variant identity — to a machine that already has one.
 */
export function fitPresetToVariant(
  config: PresetConfig,
  targetVariantId: VariantId,
  ruleset: Ruleset,
): MachineSeed {
  return {
    variantId: targetVariantId,
    loadout: {
      weapon: config.loadout.weapon,
      defense: config.loadout.defense,
      utilities: fitUtilities(config.loadout.utilities, utilitySlots(targetVariantId, ruleset), ruleset),
    },
    dials: config.dials,
    planB: config.planB,
  };
}

/** Extract the reusable, per-type bundle a save-as-preset persists (a `PresetConfig`, §8.4). */
export function toPresetConfig(machine: DraftMachine): PresetConfig {
  return {
    loadout: {
      weapon: machine.loadout.weapon,
      defense: machine.loadout.defense,
      utilities: [...machine.loadout.utilities],
    },
    dials: { ...machine.dials },
    planB: machine.planB.map((t) => ({ ...t })),
  };
}

/**
 * The custom presets offered to a slot of `typeId` — type-scoped by their `machineTypeId` (§8.4), so a
 * different-type machine is never offered them (FR-013/AS3).
 */
export function presetsForType<T extends { machineTypeId: string }>(
  presets: readonly T[],
  typeId: string,
): T[] {
  return presets.filter((p) => p.machineTypeId === typeId);
}

/**
 * A stock preset is already a legal build for **its own** variant (`defaultFor`), so applying it needs
 * no re-fitting — return its seed verbatim. (Split out so the picker's stock and custom paths read the
 * same at the call site.)
 */
export function stockSeed(preset: CatalogPreset): MachineSeed {
  return preset.seed;
}

/** Everything the `applyPreset` reducer verb needs to fully specify a slot's machine. */
export interface ApplyPlan {
  typeId: MachineTypeId;
  zone: ZoneId;
  seed: MachineSeed;
  sourcePresetId: string;
}

/**
 * Plan applying a **stock** preset to a slot: it carries its own variant + type, so the seed is used
 * verbatim. A filled slot keeps its current zone; an empty slot (the on-ramp) drops into the type's
 * home zone.
 */
export function planStockApply(
  preset: CatalogPreset,
  currentZone: ZoneId | null,
  ruleset: Ruleset,
): ApplyPlan {
  return {
    typeId: preset.typeId,
    zone: currentZone ?? defaultZoneFor(preset.typeId, ruleset),
    seed: stockSeed(preset),
    sourcePresetId: preset.id,
  };
}

/**
 * Plan applying a **custom** (per-type, variant-less) preset to a slot: fit its bundle to the target
 * variant — the slot's current variant when filled, else the type's default variant — so utilities
 * are re-fit to that variant's slot count (never overfilled, FR-013). Zone as in {@link planStockApply}.
 */
export function planCustomApply(
  preset: { id: string; machineTypeId: MachineTypeId; config: PresetConfig },
  currentVariantId: VariantId | null,
  currentZone: ZoneId | null,
  ruleset: Ruleset,
): ApplyPlan {
  const variantId = currentVariantId ?? defaultVariantFor(preset.machineTypeId, ruleset);
  return {
    typeId: preset.machineTypeId,
    zone: currentZone ?? defaultZoneFor(preset.machineTypeId, ruleset),
    seed: fitPresetToVariant(preset.config, variantId, ruleset),
    sourcePresetId: preset.id,
  };
}
