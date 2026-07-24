'use client';

/**
 * The behavior-dial editor (v3) — the **targeting priority-score chain** (two class filters + a
 * positional fallback), Position (movement), and Stance. v3 removed the energy dial and **all**
 * capability-gated dial options, so every option here is freely selectable. Each change re-derives +
 * re-validates via the reducer.
 */

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { SectionLabel } from '@/components/ui/section-label';
import {
  MOVEMENT_OPTIONS,
  STANCE_OPTIONS,
  TARGET_FILTER_OPTIONS,
  TARGET_SELECTOR_OPTIONS,
  describeFilter,
} from '@/lib/garage/dials';
import { humanize } from '@/lib/garage/display';
import { explainDial, explainTargeting } from '@/lib/garage/explain';
import type { SlotIndex } from '@/lib/garage/types';
import { useGarageEditor } from '@/lib/garage/use-garage-editor';
import type { BehaviorDials, TargetFilter, TargetingChain } from '@/sim/model';

import { EffectBreakdown } from './effect-breakdown';
import { FieldSelect } from './field-select';

/** A select over a scalar dial (movement | stance). */
function ScalarDialSelect({
  slot,
  dial,
  options,
}: {
  slot: SlotIndex;
  dial: 'movement' | 'stance';
  options: readonly string[];
}) {
  const { session, dispatch } = useGarageEditor();
  const machine = session.draft.machines[slot];
  if (machine === null) return null;
  const current = machine.dials[dial];

  return (
    <FieldSelect current={humanize(current)} ariaLabel={dial}>
      {options.map((opt) => (
        <DropdownMenuItem
          key={opt}
          onSelect={() =>
            dispatch({ type: 'setDial', slot, patch: { [dial]: opt } as Partial<BehaviorDials> })
          }
        >
          <span className="type-body-sm text-text-strong">{humanize(opt)}</span>
        </DropdownMenuItem>
      ))}
    </FieldSelect>
  );
}

/** A select over one targeting-chain priority tier — "Any" (no filter) plus the five class filters. */
function PrioritySelect({ slot, tier }: { slot: SlotIndex; tier: 'priority1' | 'priority2' }) {
  const { session, dispatch } = useGarageEditor();
  const machine = session.draft.machines[slot];
  if (machine === null) return null;
  const chain = machine.dials.targeting;

  const patchTier = (next: TargetFilter | undefined) => {
    const targeting: TargetingChain = { ...chain };
    if (next === undefined) delete targeting[tier];
    else targeting[tier] = next;
    dispatch({ type: 'setDial', slot, patch: { targeting } });
  };

  return (
    <FieldSelect current={describeFilter(chain[tier])} ariaLabel={tier}>
      <DropdownMenuItem onSelect={() => patchTier(undefined)}>
        <span className="type-body-sm text-text-strong">Any (no filter)</span>
      </DropdownMenuItem>
      {TARGET_FILTER_OPTIONS.map((opt) => (
        <DropdownMenuItem key={opt} onSelect={() => patchTier(opt)}>
          <span className="type-body-sm text-text-strong">{describeFilter(opt)}</span>
        </DropdownMenuItem>
      ))}
    </FieldSelect>
  );
}

/** The positional fallback selector (Closest | Furthest) — always resolves. */
function FallbackSelect({ slot }: { slot: SlotIndex }) {
  const { session, dispatch } = useGarageEditor();
  const machine = session.draft.machines[slot];
  if (machine === null) return null;
  const chain = machine.dials.targeting;

  return (
    <FieldSelect current={humanize(chain.fallback)} ariaLabel="fallback">
      {TARGET_SELECTOR_OPTIONS.map((opt) => (
        <DropdownMenuItem
          key={opt}
          onSelect={() =>
            dispatch({ type: 'setDial', slot, patch: { targeting: { ...chain, fallback: opt } } })
          }
        >
          <span className="type-body-sm text-text-strong">{humanize(opt)}</span>
        </DropdownMenuItem>
      ))}
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
          Targeting
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <PrioritySelect slot={slot} tier="priority1" />
          <PrioritySelect slot={slot} tier="priority2" />
        </div>
        <FallbackSelect slot={slot} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel index="02" rule={false}>
          Position
        </SectionLabel>
        <ScalarDialSelect slot={slot} dial="movement" options={MOVEMENT_OPTIONS} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel index="03" rule={false}>
          Stance
        </SectionLabel>
        <ScalarDialSelect slot={slot} dial="stance" options={STANCE_OPTIONS} />
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
      items={[
        { slotLabel: 'TARGETING', ex: explainTargeting(machine.dials.targeting) },
        { slotLabel: 'POSITION', ex: explainDial('movement', machine.dials.movement, ruleset) },
        { slotLabel: 'STANCE', ex: explainDial('stance', machine.dials.stance, ruleset) },
      ]}
    />
  );
}
