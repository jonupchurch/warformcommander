/**
 * The pure Garage editor reducer (T008, [data-model.md](../../specs/004-garage/data-model.md) action
 * surface). A `useReducer`-shaped `(session, action) → session` transition set over
 * {@link EditorSession}, kept **pure and serializable** (dirty-diff, potential undo) via Immer — so
 * every verb is independently unit-testable (constitution Principle VIII) and **no action touches
 * persistence** (save/designate are async Feature 7 calls dispatched from the UI, [research C2]).
 *
 * Ruleset-derived data (a machine's seeded default loadout/dials on `setType`/`setVariant`) is carried
 * **in the action payload**, computed by the caller via [`preset-catalog`](./preset-catalog.ts) — the
 * reducer stays pure and holds no ruleset.
 */

import { produce } from 'immer';

import type {
  BehaviorDials,
  EquipmentId,
  Loadout,
  MachineTypeId,
  PlanBSlot,
  PlanBTrigger,
  VariantId,
  ZoneId,
} from '@/sim/model';

import type {
  DraftMachine,
  DraftSquad,
  EditorPane,
  EditorSession,
  SlotIndex,
} from './types';
import { SLOT_COUNT } from './types';

/** The seeded default machine setup carried on `setType`/`setVariant` (from `preset-catalog`). */
export interface MachineSeed {
  variantId: VariantId;
  loadout: Loadout;
  dials: BehaviorDials;
  planB: PlanBTrigger[];
}

/** The editor verbs — pure transitions over {@link EditorSession}. */
export type EditorAction =
  | { type: 'createSquad'; name?: string }
  | { type: 'renameSquad'; name: string }
  | { type: 'setRosterSlot'; index: number | null }
  | { type: 'setType'; slot: SlotIndex; typeId: MachineTypeId; seed: MachineSeed; zone: ZoneId }
  | { type: 'setVariant'; slot: SlotIndex; seed: MachineSeed }
  | {
      type: 'applyPreset';
      slot: SlotIndex;
      typeId: MachineTypeId;
      zone: ZoneId;
      seed: MachineSeed;
      sourcePresetId: string;
    }
  | { type: 'setWeapon'; slot: SlotIndex; equipmentId: EquipmentId }
  | { type: 'setDefense'; slot: SlotIndex; equipmentId: EquipmentId }
  | { type: 'setUtility'; slot: SlotIndex; index: number; equipmentId: EquipmentId }
  | { type: 'clearUtility'; slot: SlotIndex; index: number }
  | { type: 'setDial'; slot: SlotIndex; patch: Partial<BehaviorDials> }
  | { type: 'addPlanB'; slot: SlotIndex; trigger: PlanBTrigger }
  | { type: 'setPlanB'; slot: SlotIndex; trigger: PlanBTrigger }
  | { type: 'removePlanB'; slot: SlotIndex; planBSlot: PlanBSlot }
  | { type: 'clearSlot'; slot: SlotIndex }
  | { type: 'duplicateMachine'; from: SlotIndex }
  | { type: 'selectMachine'; slot: SlotIndex | null }
  | { type: 'pickUpForPlacement'; slot: SlotIndex | null }
  | { type: 'placeInZone'; slot: SlotIndex; zone: ZoneId }
  | { type: 'setActivePane'; pane: EditorPane }
  | {
      type: 'loadSquad';
      squadId: string;
      rosterSlotIndex: number;
      defenseSlot: 0 | 1 | 2 | null;
      draft: DraftSquad;
    }
  | { type: 'duplicateSquad'; rosterSlotIndex: number; draft: DraftSquad }
  | { type: 'markSaved'; squadId: string; rosterSlotIndex: number | null };

/** A fresh, empty five-slot draft. */
export function emptyDraft(name = 'New Squad'): DraftSquad {
  return { name, machines: [null, null, null, null, null] };
}

/** A brand-new editing session (no saved baseline, nothing selected). */
export function freshSession(name?: string): EditorSession {
  return {
    draft: emptyDraft(name),
    savedBaseline: null,
    selection: { selectedSlot: null, placingSlot: null, activePane: 'Formation' },
    rosterSlotIndex: null,
    defenseSlot: null,
    editingSquadId: null,
    status: 'Editing',
  };
}

/**
 * A structural clone of a draft (for the saved baseline). Drafts are plain JSON, so a JSON round-trip
 * clones them — and unlike `structuredClone` it also works on the Immer draft proxy inside `produce`.
 */
function cloneDraft(draft: DraftSquad): DraftSquad {
  return JSON.parse(JSON.stringify(draft)) as DraftSquad;
}

/** `true` when the draft differs from the last-saved baseline (a new squad with any content is dirty). */
export function isDirty(session: EditorSession): boolean {
  if (session.savedBaseline === null) {
    // A new squad is dirty once any slot is filled or it has been renamed.
    return (
      session.draft.machines.some((m) => m !== null) || session.draft.name !== 'New Squad'
    );
  }
  return JSON.stringify(session.draft) !== JSON.stringify(session.savedBaseline);
}

/** The pure reducer. */
export function garageReducer(session: EditorSession, action: EditorAction): EditorSession {
  switch (action.type) {
    case 'createSquad':
      return freshSession(action.name);

    case 'loadSquad':
      return {
        draft: cloneDraft(action.draft),
        savedBaseline: cloneDraft(action.draft),
        selection: { selectedSlot: null, placingSlot: null, activePane: 'Formation' },
        rosterSlotIndex: action.rosterSlotIndex,
        defenseSlot: action.defenseSlot,
        editingSquadId: action.squadId,
        status: 'Editing',
      };

    case 'duplicateSquad':
      // A fork of an existing squad into a **new, unsaved** build: same machines, a free roster slot,
      // no `editingSquadId` (so Save inserts rather than overwriting the source) and no baseline (so
      // it is dirty and the source's defense designation does not carry over).
      return {
        draft: cloneDraft(action.draft),
        savedBaseline: null,
        selection: { selectedSlot: null, placingSlot: null, activePane: 'Formation' },
        rosterSlotIndex: action.rosterSlotIndex,
        defenseSlot: null,
        editingSquadId: null,
        status: 'Editing',
      };

    default:
      return produce(session, (d) => {
        switch (action.type) {
          case 'renameSquad':
            d.draft.name = action.name;
            break;

          case 'setRosterSlot':
            d.rosterSlotIndex = action.index;
            break;

          case 'setType':
            d.draft.machines[action.slot] = {
              typeId: action.typeId,
              variantId: action.seed.variantId,
              loadout: action.seed.loadout,
              dials: action.seed.dials,
              planB: action.seed.planB,
              zone: action.zone,
            };
            break;

          case 'setVariant': {
            const machine = d.draft.machines[action.slot];
            if (machine === null) break; // no-op on an empty slot
            machine.variantId = action.seed.variantId;
            machine.loadout = action.seed.loadout;
            machine.dials = action.seed.dials;
            machine.planB = action.seed.planB;
            machine.sourcePresetId = undefined;
            break;
          }

          case 'applyPreset':
            // Fully specifies the slot's machine: the caller (with the ruleset) has already fit the
            // bundle to the target variant (utility slot count) and chosen the zone. Works on an
            // empty slot (the on-ramp — fields a fresh machine) or a filled one (re-apply). Unlike a
            // hand edit, this **stamps** `sourcePresetId` so the UI can show "from <preset>".
            d.draft.machines[action.slot] = {
              typeId: action.typeId,
              variantId: action.seed.variantId,
              loadout: action.seed.loadout,
              dials: action.seed.dials,
              planB: action.seed.planB,
              zone: action.zone,
              sourcePresetId: action.sourcePresetId,
            };
            break;

          case 'setWeapon': {
            const machine = d.draft.machines[action.slot];
            if (machine === null) break;
            machine.loadout.weapon = action.equipmentId;
            machine.sourcePresetId = undefined;
            break;
          }

          case 'setDefense': {
            const machine = d.draft.machines[action.slot];
            if (machine === null) break;
            machine.loadout.defense = action.equipmentId;
            machine.sourcePresetId = undefined;
            break;
          }

          case 'setUtility': {
            const machine = d.draft.machines[action.slot];
            if (machine === null) break;
            if (action.index >= 0 && action.index < machine.loadout.utilities.length) {
              machine.loadout.utilities[action.index] = action.equipmentId;
              machine.sourcePresetId = undefined;
            }
            break;
          }

          case 'clearUtility': {
            const machine = d.draft.machines[action.slot];
            if (machine === null) break;
            if (action.index >= 0 && action.index < machine.loadout.utilities.length) {
              machine.loadout.utilities.splice(action.index, 1);
              machine.sourcePresetId = undefined;
            }
            break;
          }

          case 'setDial': {
            const machine = d.draft.machines[action.slot];
            if (machine === null) break;
            Object.assign(machine.dials, action.patch);
            machine.sourcePresetId = undefined;
            break;
          }

          case 'addPlanB': {
            const machine = d.draft.machines[action.slot];
            if (machine === null) break;
            machine.planB.push(action.trigger);
            machine.sourcePresetId = undefined;
            break;
          }

          case 'setPlanB': {
            const machine = d.draft.machines[action.slot];
            if (machine === null) break;
            const idx = machine.planB.findIndex((t) => t.slot === action.trigger.slot);
            if (idx >= 0) machine.planB[idx] = action.trigger;
            else machine.planB.push(action.trigger);
            machine.sourcePresetId = undefined;
            break;
          }

          case 'removePlanB': {
            const machine = d.draft.machines[action.slot];
            if (machine === null) break;
            machine.planB = machine.planB.filter((t) => t.slot !== action.planBSlot);
            machine.sourcePresetId = undefined;
            break;
          }

          case 'clearSlot':
            d.draft.machines[action.slot] = null;
            if (d.selection.selectedSlot === action.slot) d.selection.selectedSlot = null;
            if (d.selection.placingSlot === action.slot) d.selection.placingSlot = null;
            break;

          case 'duplicateMachine': {
            // Clone a fully-configured machine (loadout + dials + planB + zone + preset origin) into
            // the first free slot, exactly as-is, and select the copy. No-op if the source is empty
            // or the squad is already full. The copy keeps the source's zone (an *exact* duplicate);
            // if that overfills the zone, validation flags it and the player can MOVE it.
            const src = d.draft.machines[action.from];
            if (src === null) break;
            const target = d.draft.machines.findIndex((m) => m === null);
            if (target === -1) break; // squad full — nothing free to clone into
            d.draft.machines[target] = JSON.parse(JSON.stringify(src)) as DraftMachine;
            d.selection.selectedSlot = target as SlotIndex;
            break;
          }

          case 'selectMachine':
            d.selection.selectedSlot = action.slot;
            break;

          case 'pickUpForPlacement':
            d.selection.placingSlot = action.slot;
            break;

          case 'placeInZone': {
            const machine = d.draft.machines[action.slot];
            if (machine === null) break; // no-op on an empty slot
            machine.zone = action.zone;
            d.selection.placingSlot = null;
            break;
          }

          case 'setActivePane':
            d.selection.activePane = action.pane;
            break;

          case 'markSaved':
            d.savedBaseline = cloneDraft(d.draft);
            d.editingSquadId = action.squadId;
            if (action.rosterSlotIndex !== null) d.rosterSlotIndex = action.rosterSlotIndex;
            d.status = 'Saved';
            break;
        }
      });
  }
}

export { SLOT_COUNT };
