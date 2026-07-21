'use client';

/**
 * The center board (T018/T020/T021) — the squad header (rename + live PWR/summary), the `+ ADD UNIT`
 * type picker (seeds a default legal build into the first empty slot), the four zone rows, and the
 * **Save** button gated by the client `validate()` (convenience; the server re-validates, A4). A
 * server rejection surfaces below.
 */

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Panel } from '@/components/ui/panel';
import { SectionLabel } from '@/components/ui/section-label';
import {
  ZONE_ORDER,
  familyTone,
  type ChipTone,
} from '@/lib/garage/display';
import { defaultFor, defaultVariantFor, defaultZoneFor } from '@/lib/garage/preset-catalog';
import { firstFreeRosterSlot } from '@/lib/garage/roster';
import type { DraftSquad, SlotIndex } from '@/lib/garage/types';
import { useGarageEditor } from '@/lib/garage/use-garage-editor';
import type { MachineTypeId } from '@/sim/model';
import type { DamageFamily } from '@/sim/ruleset';

import { StarterPicker } from './starter-picker';
import { TypePicker } from './type-picker';
import { ValidationNotice } from './validation-notice';
import { ZoneRow } from './zone-row';

/** The lowest empty slot (0..4), or `null` when the squad is full. */
function firstEmptySlot(draft: DraftSquad): SlotIndex | null {
  const i = draft.machines.findIndex((m) => m === null);
  return i === -1 ? null : (i as SlotIndex);
}

/** A summary tag → its `Chip` tone (AA readiness or a damage family). */
function tagTone(tag: string): ChipTone | 'rear' {
  if (tag === 'AA READY') return 'air';
  if (tag === 'NO AA') return 'rear';
  return familyTone(tag as DamageFamily);
}

export function FormationBoard() {
  const { session, dispatch, ruleset, roster, preview, validation, isDirty, saving, save } =
    useGarageEditor();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Duplicate is available only for an already-saved squad and only when a roster slot is free — the
  // fork lands in that slot as a fresh unsaved build (see the `duplicateSquad` reducer verb).
  const freeSlot = firstFreeRosterSlot(new Set(roster.map((r) => r.slotIndex)));
  const canDuplicate = session.editingSquadId !== null && freeSlot !== null && !saving;

  const emptySlot = firstEmptySlot(session.draft);
  const placingSlot = session.selection.placingSlot;
  const placing = placingSlot === null ? null : session.draft.machines[placingSlot];
  const filled = session.draft.machines.filter((m) => m !== null).length;

  function addUnit(type: MachineTypeId) {
    if (emptySlot === null) return;
    const variantId = defaultVariantFor(type, ruleset);
    dispatch({
      type: 'setType',
      slot: emptySlot,
      typeId: type,
      seed: defaultFor(variantId, ruleset),
      zone: defaultZoneFor(type, ruleset),
    });
    dispatch({ type: 'selectMachine', slot: emptySlot });
  }

  async function onSave() {
    setSaveError(null);
    const res = await save();
    if (!res.ok) setSaveError(res.reason ?? res.error);
  }

  function onDuplicate() {
    if (session.editingSquadId === null || freeSlot === null) return;
    setSaveError(null);
    dispatch({
      type: 'duplicateSquad',
      rosterSlotIndex: freeSlot,
      draft: { name: `${session.draft.name} (copy)`, machines: session.draft.machines },
    });
  }

  return (
    <Panel inset="sunken" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <input
            value={session.draft.name}
            onChange={(e) => dispatch({ type: 'renameSquad', name: e.target.value })}
            aria-label="Squad name"
            className="type-h2 min-w-0 rounded-sm bg-transparent text-text-strong outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-readout text-faction-friendly">PWR {preview.squadPower}</span>
            <span className="type-readout text-text-dim">{filled}/5 UNITS</span>
            {preview.summaryTags.map((tag) => (
              <Chip key={tag} tone={tagTone(tag)}>
                {tag}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StarterPicker slot={emptySlot} disabled={emptySlot === null} />
          <TypePicker onPick={addUnit} disabled={emptySlot === null} />
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onDuplicate}
            disabled={!canDuplicate}
            title={
              session.editingSquadId === null
                ? 'Save this squad first, then duplicate it'
                : freeSlot === null
                  ? 'Roster is full — free a slot to duplicate'
                  : 'Copy this squad into a free slot to save under a new name'
            }
          >
            DUPLICATE
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={onSave}
            disabled={!validation.isLegal || !isDirty || saving}
          >
            {saving ? 'SAVING…' : 'SAVE SQUAD'}
          </Button>
        </div>
      </div>

      {placing !== null && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-faction-friendly bg-surface-raised px-3 py-2">
          <span className="type-body-sm text-text-strong">
            Placing {placing.variantId} — choose a zone.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: 'pickUpForPlacement', slot: null })}
          >
            CANCEL
          </Button>
        </div>
      )}

      <SectionLabel>Formation · Front to Rear</SectionLabel>
      <div className="flex flex-col gap-2">
        {ZONE_ORDER.map((zone) => (
          <ZoneRow key={zone} zone={zone} />
        ))}
      </div>

      {!validation.isLegal && filled > 0 && (
        <ValidationNotice
          errors={validation.squadLevel.length > 0 ? validation.squadLevel : validation.errors}
        />
      )}
      {saveError && (
        <p role="alert" className="type-body-sm text-faction-enemy">
          Save failed: {saveError}
        </p>
      )}
    </Panel>
  );
}
