'use client';

/**
 * The Garage editor context (T009, [contract §4](../../specs/004-garage/contracts/editor-state.md)).
 * A scoped `"use client"` provider over the pure {@link garageReducer}, exposing the **memoized**
 * derived views (`preview` via `deriveEffectiveStats`, `validation` via `validateArmy` — computed
 * during render, never mirrored into state, [research A2]) plus the **async, non-reducer** service
 * calls (`save`/`designate`/`saveCurrentAsPreset`) that hit Feature 7 (persistence is never a reducer
 * transition, [research C2]).
 *
 * The client `validation` is **convenience** that gates the Save button; the server-side `validate`
 * inside the Feature 7 action is the sole authority (Principle II) — a server rejection surfaces back.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';

import { err, type Result } from '@/server/result';
import type { DefenseSnapshot } from '@/server/defense';
import type { Preset } from '@/server/presets';
import type { Squad } from '@/server/squads';
import type { PresetConfig } from '@/sim/model';
import type { Ruleset } from '@/sim/ruleset';

import {
  saveSquadAction,
  updateSquadAction,
  designateDefenseAction,
  savePresetAction,
} from './actions';
import {
  freshSession,
  garageReducer,
  isDirty as computeIsDirty,
  type EditorAction,
} from './editor-reducer';
import { toSquadConfig } from './to-squad-config';
import type { EditorSession } from './types';
import {
  computeStatPreview,
  computeValidationView,
  type StatPreview,
  type ValidationView,
} from './view-model';

/** Everything a Garage screen composite needs from the editor. */
export interface GarageEditorContextValue {
  session: EditorSession;
  dispatch: Dispatch<EditorAction>;
  /** The client ruleset (for pickers + derivation in children). */
  ruleset: Ruleset;
  /** The player's saved roster (Feature 7 `listSquads`), for the rail. */
  roster: Squad[];
  /** The selected machine's live derived readout + squad aggregate (memoized). */
  preview: StatPreview;
  /** The client `validate()` view — gates the Save button (convenience only). */
  validation: ValidationView;
  /** `draft ≠ savedBaseline`. */
  isDirty: boolean;
  /** A save is in flight. */
  saving: boolean;
  /** Project + persist via Feature 7; on success updates the saved baseline. */
  save: () => Promise<Result<Squad>>;
  /** Designate the (saved) squad into a defense slot via Feature 7. */
  designate: (slot: 0 | 1 | 2) => Promise<Result<DefenseSnapshot>>;
  /** Save the selected machine's setup as a custom per-type preset via Feature 7. */
  saveCurrentAsPreset: (name: string) => Promise<Result<Preset>>;
}

const GarageEditorContext = createContext<GarageEditorContextValue | null>(null);

export interface GarageEditorProviderProps {
  ruleset: Ruleset;
  roster: Squad[];
  initialSession?: EditorSession;
  children: ReactNode;
}

export function GarageEditorProvider({
  ruleset,
  roster,
  initialSession,
  children,
}: GarageEditorProviderProps) {
  const [session, dispatch] = useReducer(
    garageReducer,
    initialSession ?? null,
    (init) => init ?? freshSession(),
  );
  const [saving, setSaving] = useState(false);

  const validation = useMemo(
    () => computeValidationView(session.draft, ruleset),
    [session.draft, ruleset],
  );
  const preview = useMemo(
    () => computeStatPreview(session.draft, session.selection.selectedSlot, ruleset),
    [session.draft, session.selection.selectedSlot, ruleset],
  );
  const isDirty = useMemo(() => computeIsDirty(session), [session]);

  const save = useCallback<GarageEditorContextValue['save']>(async () => {
    setSaving(true);
    try {
      const config = toSquadConfig(session.draft);
      let res: Result<Squad>;
      if (session.editingSquadId !== null) {
        res = await updateSquadAction(session.editingSquadId, {
          name: session.draft.name,
          config,
        });
      } else if (session.rosterSlotIndex === null) {
        return err('SLOT_CAP_EXCEEDED', 'choose a roster slot before saving');
      } else {
        res = await saveSquadAction({
          slotIndex: session.rosterSlotIndex,
          name: session.draft.name,
          config,
        });
      }
      if (res.ok) {
        dispatch({ type: 'markSaved', squadId: res.value.id, rosterSlotIndex: res.value.slotIndex });
      }
      return res;
    } finally {
      setSaving(false);
    }
  }, [session.draft, session.editingSquadId, session.rosterSlotIndex]);

  const designate = useCallback<GarageEditorContextValue['designate']>(
    async (slot) => {
      if (session.editingSquadId === null) {
        return err('NOT_FOUND', 'save the squad before designating it for defense');
      }
      return designateDefenseAction({ squadId: session.editingSquadId, slot });
    },
    [session.editingSquadId],
  );

  const saveCurrentAsPreset = useCallback<GarageEditorContextValue['saveCurrentAsPreset']>(
    async (name) => {
      const slot = session.selection.selectedSlot;
      const machine = slot === null ? null : session.draft.machines[slot];
      if (!machine) return err('NOT_FOUND', 'select a machine to save as a preset');
      const config: PresetConfig = {
        loadout: machine.loadout,
        dials: machine.dials,
        planB: machine.planB,
      };
      return savePresetAction({ name, machineTypeId: machine.typeId, config });
    },
    [session.draft, session.selection.selectedSlot],
  );

  const value = useMemo<GarageEditorContextValue>(
    () => ({
      session,
      dispatch,
      ruleset,
      roster,
      preview,
      validation,
      isDirty,
      saving,
      save,
      designate,
      saveCurrentAsPreset,
    }),
    [session, ruleset, roster, preview, validation, isDirty, saving, save, designate, saveCurrentAsPreset],
  );

  return <GarageEditorContext.Provider value={value}>{children}</GarageEditorContext.Provider>;
}

/** Access the Garage editor context. Throws if used outside a {@link GarageEditorProvider}. */
export function useGarageEditor(): GarageEditorContextValue {
  const ctx = useContext(GarageEditorContext);
  if (ctx === null) {
    throw new Error('useGarageEditor must be used within a GarageEditorProvider');
  }
  return ctx;
}
