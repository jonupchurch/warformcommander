'use client';

/**
 * The behavior-dial editor (T028, US3) — the four dials (Target Priority = row + rule, Energy,
 * Position, Stance). Starter options are always available; the three engine-gated options (Adaptive
 * energy, Opportunist stance, Target-Air rule) are **disabled unless** the machine's utilities unlock
 * them (`unlockedCapabilities`), exactly mirroring the engine's V7 (P8). Each change re-derives +
 * re-validates.
 */

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { SectionLabel } from '@/components/ui/section-label';
import {
  ENERGY_OPTIONS,
  MOVEMENT_OPTIONS,
  STANCE_OPTIONS,
  TARGET_ROW_OPTIONS,
  TARGET_RULE_OPTIONS,
  dialOptionLocked,
} from '@/lib/garage/dials';
import { humanize } from '@/lib/garage/display';
import { DIAL_SECTIONS, explainDial } from '@/lib/garage/explain';
import type { SlotIndex } from '@/lib/garage/types';
import { useGarageEditor } from '@/lib/garage/use-garage-editor';
import { unlockedCapabilities } from '@/sim/derive';
import type { BehaviorDials } from '@/sim/model';
import { cn } from '@/lib/utils';

import { EffectBreakdown } from './effect-breakdown';
import { FieldSelect } from './field-select';

function DialSelect({
  slot,
  dial,
  options,
}: {
  slot: SlotIndex;
  dial: keyof BehaviorDials;
  options: readonly string[];
}) {
  const { session, dispatch, ruleset } = useGarageEditor();
  const machine = session.draft.machines[slot];
  if (machine === null) return null;

  const caps = unlockedCapabilities(machine.loadout, ruleset);
  const current = machine.dials[dial];

  return (
    <FieldSelect current={humanize(current)} ariaLabel={dial}>
      {options.map((opt) => {
        const locked = dialOptionLocked(dial, opt, caps);
        return (
          <DropdownMenuItem
            key={opt}
            disabled={locked}
            onSelect={() =>
              dispatch({ type: 'setDial', slot, patch: { [dial]: opt } as Partial<BehaviorDials> })
            }
            className={cn('justify-between', locked && 'opacity-40')}
          >
            <span className="type-body-sm text-text-strong">{humanize(opt)}</span>
            {locked && <span className="type-eyebrow ml-auto text-text-faint">LOCKED</span>}
          </DropdownMenuItem>
        );
      })}
    </FieldSelect>
  );
}

export function DialEditor() {
  const { session } = useGarageEditor();
  const slot = session.selection.selectedSlot;
  const machine = slot === null ? null : session.draft.machines[slot];

  if (machine === null || slot === null) {
    return <p className="type-body-sm text-text-muted">Select a machine to set its dials.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SectionLabel index="01" rule={false}>
          Target Priority
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <DialSelect slot={slot} dial="targetRow" options={TARGET_ROW_OPTIONS} />
          <DialSelect slot={slot} dial="targetRule" options={TARGET_RULE_OPTIONS} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel index="02" rule={false}>
          Energy
        </SectionLabel>
        <DialSelect slot={slot} dial="energy" options={ENERGY_OPTIONS} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel index="03" rule={false}>
          Position
        </SectionLabel>
        <DialSelect slot={slot} dial="movement" options={MOVEMENT_OPTIONS} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel index="04" rule={false}>
          Stance
        </SectionLabel>
        <DialSelect slot={slot} dial="stance" options={STANCE_OPTIONS} />
      </div>
    </div>
  );
}

/**
 * What the selected dials actually do. Rendered at the foot of the Behavior tab (after Plan-B) so
 * the explanations sit below every control they describe.
 */
export function DialBreakdown() {
  const { session, ruleset } = useGarageEditor();
  const slot = session.selection.selectedSlot;
  const machine = slot === null ? null : session.draft.machines[slot];
  if (machine === null) return null;

  return (
    <EffectBreakdown
      index="06"
      title="What these orders do"
      items={DIAL_SECTIONS.map(({ dial, label }) => ({
        slotLabel: label.toUpperCase(),
        ex: explainDial(dial, machine.dials[dial], ruleset),
      }))}
    />
  );
}
