'use client';

/**
 * The loadout editor (T024/T025, US2) — weapon / defense / utility pickers that offer **only**
 * mount-legal options (family crossover), enforce utility **dedup** by disabling already-equipped
 * options in the other slots, and respect the variant's slot count (3 or 4). Every change dispatches
 * a reducer action, so the preview re-derives and `validate` re-runs (memoized). The **native-family
 * bonus** vs an off-family sidegrade is made legible (P1, FR-006).
 */

import type { ReactNode } from 'react';

import { Chip } from '@/components/ui/chip';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { SectionLabel } from '@/components/ui/section-label';
import { familyTone } from '@/lib/garage/display';
import {
  explainDefense,
  explainUtility,
  explainWeapon,
  type Explanation,
} from '@/lib/garage/explain';
import {
  defenseOptions,
  isNativeWeapon,
  utilityOptions,
  weaponOptions,
} from '@/lib/garage/loadout-options';
import type { SlotIndex } from '@/lib/garage/types';
import { useGarageEditor } from '@/lib/garage/use-garage-editor';
import { cn } from '@/lib/utils';

import { EffectBreakdown, ExplanationCard } from './effect-breakdown';
import { FieldSelect } from './field-select';

/**
 * Wrap a dropdown option so hovering (or keyboard-focusing) it flies out an {@link ExplanationCard}
 * with that item's stats — the same breakdown shown for the current pick, but for the option under the
 * cursor, so you can compare before committing. The card's own chrome supplies the surface, so the
 * hover-card container is stripped to a bare positioned wrapper.
 */
function OptionFlyout({
  label,
  ex,
  children,
}: {
  label: string;
  ex: Explanation;
  children: ReactNode;
}) {
  return (
    <HoverCard openDelay={120} closeDelay={0}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-72 border-0 bg-transparent p-0 shadow-lg"
      >
        <ExplanationCard slotLabel={label} ex={ex} />
      </HoverCardContent>
    </HoverCard>
  );
}

function WeaponRow({ slot }: { slot: SlotIndex }) {
  const { session, dispatch, ruleset } = useGarageEditor();
  const machine = session.draft.machines[slot];
  if (machine === null) return null;

  const options = weaponOptions(machine.typeId, ruleset);
  const current = ruleset.equipment[machine.loadout.weapon];
  const currentIsWeapon = current?.kind === 'Weapon';
  const native = currentIsWeapon && isNativeWeapon(machine.typeId, current, ruleset);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel index="01" rule={false} className="text-faction-friendly">
          Weapon
        </SectionLabel>
        {currentIsWeapon &&
          (native ? (
            <Chip tone={familyTone(current.family)}>NATIVE BONUS</Chip>
          ) : (
            <Chip tone="neutral">SIDEGRADE</Chip>
          ))}
      </div>
      <FieldSelect current={current?.name ?? machine.loadout.weapon}>
        {options.map((w) => {
          const isNative = isNativeWeapon(machine.typeId, w, ruleset);
          return (
            <OptionFlyout key={w.id} label="WEAPON" ex={explainWeapon(w, machine.typeId, ruleset)}>
              <DropdownMenuItem
                onSelect={() => dispatch({ type: 'setWeapon', slot, equipmentId: w.id })}
                className="justify-between gap-3"
              >
                <span className="type-body-sm text-text-strong">{w.name}</span>
                <span className="flex items-center gap-1.5">
                  <Chip tone={familyTone(w.family)}>{w.family.toUpperCase()}</Chip>
                  {isNative && <span className="type-eyebrow text-family-support">NATIVE</span>}
                </span>
              </DropdownMenuItem>
            </OptionFlyout>
          );
        })}
      </FieldSelect>
    </div>
  );
}

function DefenseRow({ slot }: { slot: SlotIndex }) {
  const { session, dispatch, ruleset } = useGarageEditor();
  const machine = session.draft.machines[slot];
  if (machine === null) return null;

  const options = defenseOptions(machine.typeId, ruleset);
  const current = ruleset.equipment[machine.loadout.defense];

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel index="02" rule={false} className="text-family-explosive">
        Defense
      </SectionLabel>
      <FieldSelect current={current?.name ?? machine.loadout.defense}>
        {options.map((d) => (
          <OptionFlyout key={d.id} label="DEFENSE" ex={explainDefense(d, ruleset)}>
            <DropdownMenuItem
              onSelect={() => dispatch({ type: 'setDefense', slot, equipmentId: d.id })}
            >
              <span className="type-body-sm text-text-strong">{d.name}</span>
            </DropdownMenuItem>
          </OptionFlyout>
        ))}
      </FieldSelect>
    </div>
  );
}

function UtilityRows({ slot }: { slot: SlotIndex }) {
  const { session, dispatch, ruleset } = useGarageEditor();
  const machine = session.draft.machines[slot];
  if (machine === null) return null;

  const options = utilityOptions(ruleset);
  const equipped = machine.loadout.utilities;

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel index="03" rule={false}>
        Utilities
      </SectionLabel>
      {equipped.map((id, index) => {
        const current = ruleset.equipment[id];
        return (
          <div key={index} className="flex items-center gap-2">
            <span className="type-eyebrow w-16 shrink-0 text-text-dim">SLOT {index + 1}</span>
            <FieldSelect current={current?.name ?? id}>
              {options.map((u) => {
                // Dedup (V5): disable a utility already equipped in a *different* slot.
                const usedElsewhere = equipped.some((e, j) => j !== index && e === u.id);
                const cost = u.cost ?? 1;
                return (
                  <OptionFlyout key={u.id} label="UTILITY" ex={explainUtility(u, ruleset)}>
                    <DropdownMenuItem
                      disabled={usedElsewhere}
                      onSelect={() =>
                        dispatch({ type: 'setUtility', slot, index, equipmentId: u.id })
                      }
                      className={cn('justify-between gap-3', usedElsewhere && 'opacity-40')}
                    >
                      <span className="type-body-sm text-text-strong">{u.name}</span>
                      <span className="ml-auto flex items-center gap-2">
                        {usedElsewhere && (
                          <span className="type-eyebrow text-text-faint">EQUIPPED</span>
                        )}
                        <span className="type-eyebrow text-text-dim">
                          {cost} pt{cost === 1 ? '' : 's'}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  </OptionFlyout>
                );
              })}
            </FieldSelect>
          </div>
        );
      })}
    </div>
  );
}

/** What the currently equipped weapon / defense / utilities actually do. */
function LoadoutBreakdown({ slot }: { slot: SlotIndex }) {
  const { session, ruleset } = useGarageEditor();
  const machine = session.draft.machines[slot];
  if (machine === null) return null;

  const items: { slotLabel: string; ex: Explanation }[] = [];

  const weapon = ruleset.equipment[machine.loadout.weapon];
  if (weapon?.kind === 'Weapon') {
    items.push({ slotLabel: 'WEAPON', ex: explainWeapon(weapon, machine.typeId, ruleset) });
  }
  const defense = ruleset.equipment[machine.loadout.defense];
  if (defense?.kind === 'Defense') {
    items.push({ slotLabel: 'DEFENSE', ex: explainDefense(defense, ruleset) });
  }
  machine.loadout.utilities.forEach((id, index) => {
    const util = ruleset.equipment[id];
    if (util?.kind === 'Utility') {
      items.push({ slotLabel: `SLOT ${index + 1}`, ex: explainUtility(util, ruleset) });
    }
  });

  return <EffectBreakdown index="04" title="What this build does" items={items} />;
}

export function LoadoutEditor() {
  const { session } = useGarageEditor();
  const slot = session.selection.selectedSlot;
  const machine = slot === null ? null : session.draft.machines[slot];

  if (machine === null || slot === null) {
    return (
      <p className="type-body-sm text-text-muted">Select a machine to edit its loadout.</p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <WeaponRow slot={slot} />
      <DefenseRow slot={slot} />
      <UtilityRows slot={slot} />
      <LoadoutBreakdown slot={slot} />
    </div>
  );
}
