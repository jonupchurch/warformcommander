'use client';

/**
 * The Plan-B editor (T029, US3) — up to two `when [condition] → set [dial] to [value]` triggers. The
 * available slot count is the derived `planBSlots` (1 base, 2 with the Combat-AI capability, V6), so
 * the `+ ADD TRIGGER` button disables at the cap and the gating is exactly the engine's. Slot 1
 * overrides Slot 2 on the same dial (player-assigned precedence) — surfaced as a note.
 */

import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { SectionLabel } from '@/components/ui/section-label';
import {
  PLANB_CONDITIONS,
  PLANB_RESPONSES,
  describeCondition,
  describeResponse,
} from '@/lib/garage/dials';
import type { SlotIndex } from '@/lib/garage/types';
import { useGarageEditor } from '@/lib/garage/use-garage-editor';
import type { PlanBSlot, PlanBTrigger } from '@/sim/model';

import { FieldSelect } from './field-select';

function TriggerRow({ slot, trigger }: { slot: SlotIndex; trigger: PlanBTrigger }) {
  const { dispatch } = useGarageEditor();

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <span className="type-eyebrow text-faction-friendly">{trigger.slot}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: 'removePlanB', slot, planBSlot: trigger.slot })}
        >
          REMOVE
        </Button>
      </div>

      <span className="type-eyebrow text-text-dim">WHEN</span>
      <FieldSelect current={describeCondition(trigger.condition)} ariaLabel="Plan-B condition">
        {PLANB_CONDITIONS.map((c) => (
          <DropdownMenuItem
            key={c.label}
            onSelect={() =>
              dispatch({ type: 'setPlanB', slot, trigger: { ...trigger, condition: c.value } })
            }
          >
            <span className="type-body-sm text-text-strong">{c.label}</span>
          </DropdownMenuItem>
        ))}
      </FieldSelect>

      <span className="type-eyebrow text-text-dim">THEN</span>
      <FieldSelect current={describeResponse(trigger)} ariaLabel="Plan-B response">
        {PLANB_RESPONSES.map((r) => (
          <DropdownMenuItem
            key={r.label}
            onSelect={() =>
              dispatch({
                type: 'setPlanB',
                slot,
                trigger: { ...trigger, dial: r.dial, planBValue: r.planBValue },
              })
            }
          >
            <span className="type-body-sm text-text-strong">{r.label}</span>
          </DropdownMenuItem>
        ))}
      </FieldSelect>
    </div>
  );
}

export function PlanBEditor() {
  const { session, dispatch, preview } = useGarageEditor();
  const slot = session.selection.selectedSlot;
  const machine = slot === null ? null : session.draft.machines[slot];
  if (machine === null || slot === null) return null;

  const maxSlots = preview.effective?.planBSlots ?? 1;
  const triggers = machine.planB;
  const canAdd = triggers.length < maxSlots;

  function addTrigger() {
    if (slot === null) return;
    const planBSlot: PlanBSlot = triggers.length === 0 ? 'Slot1' : 'Slot2';
    const condition = PLANB_CONDITIONS[0];
    const response = PLANB_RESPONSES[0];
    dispatch({
      type: 'addPlanB',
      slot,
      trigger: {
        slot: planBSlot,
        condition: condition.value,
        dial: response.dial,
        planBValue: response.planBValue,
      },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel index="05" rule={false}>
        Plan-B Triggers
      </SectionLabel>
      <p className="type-body-sm text-text-muted">
        Slot 1 overrides Slot 2 on the same dial. A second slot needs the Combat-AI capability.
      </p>

      {triggers.map((trigger) => (
        <TriggerRow key={trigger.slot} slot={slot} trigger={trigger} />
      ))}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={addTrigger}
        disabled={!canAdd}
        className="self-start"
      >
        + ADD TRIGGER ({triggers.length}/{maxSlots})
      </Button>
    </div>
  );
}
