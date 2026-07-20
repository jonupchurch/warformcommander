/**
 * The single **projection point** from the Garage view-model to a Feature 1 `SquadConfig` (T007,
 * [data-model.md](../../specs/004-garage/data-model.md)). This one shape is what the live preview,
 * the client `validateArmy`, **and** the Feature 7 `saveSquad` all consume — so there is never a
 * divergent shape between what the player sees, what the client checks, and what the server stores
 * (constitution P8).
 */

import type { MachineInstance, SquadConfig } from '@/sim/model';

import type { DraftSquad } from './types';

/**
 * Project a {@link DraftSquad} to the Feature 1 `SquadConfig`. **Empty slots are omitted**, so an
 * incomplete draft yields fewer than five machines — which the engine's `validate` (V1, squad size)
 * rejects. Each machine's `instanceId` is its **slot index** (0–4), a stable identity the engine uses
 * for deterministic tie-breaks and that the {@link import('./types').EditorSelection} maps errors
 * back to (bySlot).
 */
export function toSquadConfig(draft: DraftSquad): SquadConfig {
  const machines: MachineInstance[] = [];
  draft.machines.forEach((slot, index) => {
    if (slot === null) return;
    machines.push({
      instanceId: index,
      typeId: slot.typeId,
      variantId: slot.variantId,
      loadout: slot.loadout,
      dials: slot.dials,
      planB: slot.planB,
      zone: slot.zone,
    });
  });
  return { machines };
}
