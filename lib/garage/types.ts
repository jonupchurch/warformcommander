/**
 * The Garage **client editor view-model** (Feature 4-owned, [data-model.md](../../specs/004-garage/data-model.md)).
 * The ephemeral, **never-persisted** shape the reducer owns while a player builds a squad. On save it
 * is projected to a Feature 1 `SquadConfig` ([`toSquadConfig`](./to-squad-config.ts)) and handed to
 * Feature 7 — the Garage defines **no game types and no persistence** (constitution P8): every field
 * that is a game value is a **Feature 1 type**, imported, never redefined.
 */

import type {
  BehaviorDials,
  Loadout,
  MachineTypeId,
  PlanBTrigger,
  PresetId,
  VariantId,
  ZoneId,
} from '@/sim/model';

/** A squad has exactly five machine slots (V1). */
export const SLOT_COUNT = 5;

/** A slot index within the squad (0–4). */
export type SlotIndex = 0 | 1 | 2 | 3 | 4;

/** Which Customize section/tab is open (portrait tabs / landscape panels). */
export type EditorPane = 'Formation' | 'Loadout' | 'Dials' | 'Presets';

/** Drives the Save button + toasts. */
export type EditorStatus = 'Editing' | 'Saving' | 'Saved' | 'Error';

/**
 * The editable projection of a Feature 1 `MachineInstance`. Every field maps 1:1 to a Feature 1
 * field; `sourcePresetId` is a view-only "modified since preset" hint, **not** persisted on the
 * instance.
 */
export interface DraftMachine {
  typeId: MachineTypeId;
  variantId: VariantId;
  loadout: Loadout;
  dials: BehaviorDials;
  planB: PlanBTrigger[];
  zone: ZoneId;
  sourcePresetId?: PresetId;
}

/** A squad slot: a machine, or **empty** during construction (an empty slot ⇒ squad not yet legal, V1). */
export type DraftSlot = DraftMachine | null;

/** The editable projection of a Feature 1 `Squad`, normalized by slot index for cheap deep updates. */
export interface DraftSquad {
  name: string;
  /** Exactly five slots (0–4); a slot may be empty mid-build. */
  machines: [DraftSlot, DraftSlot, DraftSlot, DraftSlot, DraftSlot];
}

/** Which machine/slot/pane is focused. */
export interface EditorSelection {
  /** The machine under edit (drives the unit-detail pane + Customize surface). */
  selectedSlot: SlotIndex | null;
  /** A machine picked up for **tap-to-place**; the next zone tap assigns it. */
  placingSlot: SlotIndex | null;
  /** Which Customize tab/section is open. */
  activePane: EditorPane;
}

/**
 * The top-level `"use client"` state the Garage reducer owns (one per open Garage screen). Pure +
 * serializable (dirty-diff, potential undo); persistence is **never** a reducer transition.
 */
export interface EditorSession {
  /** The in-progress squad being edited. */
  draft: DraftSquad;
  /** The last-saved projection, for **dirty** diffing (`isDirty = draft ≠ savedBaseline`). */
  savedBaseline: DraftSquad | null;
  /** Which machine/slot/pane is focused. */
  selection: EditorSelection;
  /** 0–7 target roster slot (Feature 7 `squads.slotIndex`); `null` until chosen. */
  rosterSlotIndex: number | null;
  /** Mirror of the saved squad's Feature 7 `defenseSlot` (read-only; designation goes through Feature 7). */
  defenseSlot: 0 | 1 | 2 | null;
  /** The Feature 7 `squads.id` being edited (`null` = a new, unsaved squad). */
  editingSquadId: string | null;
  status: EditorStatus;
}
