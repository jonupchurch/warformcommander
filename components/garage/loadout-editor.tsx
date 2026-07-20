'use client';

/**
 * The loadout editor (T024/T025, US2) — weapon / defense / utility pickers that offer **only**
 * mount-legal options (family crossover), enforce utility **dedup** by disabling already-equipped
 * options in the other slots, and respect the variant's slot count (3 or 4). Every change dispatches
 * a reducer action, so the preview re-derives and `validate` re-runs (memoized). The **native-family
 * bonus** vs an off-family sidegrade is made legible (P1, FR-006).
 */

import { Chip } from '@/components/ui/chip';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { SectionLabel } from '@/components/ui/section-label';
import { familyTone } from '@/lib/garage/display';
import {
  defenseOptions,
  isNativeWeapon,
  utilityOptions,
  weaponOptions,
} from '@/lib/garage/loadout-options';
import type { SlotIndex } from '@/lib/garage/types';
import { useGarageEditor } from '@/lib/garage/use-garage-editor';
import { cn } from '@/lib/utils';

import { FieldSelect } from './field-select';

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
            <DropdownMenuItem
              key={w.id}
              onSelect={() => dispatch({ type: 'setWeapon', slot, equipmentId: w.id })}
              className="justify-between gap-3"
            >
              <span className="type-body-sm text-text-strong">{w.name}</span>
              <span className="flex items-center gap-1.5">
                <Chip tone={familyTone(w.family)}>{w.family.toUpperCase()}</Chip>
                {isNative && <span className="type-eyebrow text-family-support">NATIVE</span>}
              </span>
            </DropdownMenuItem>
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
          <DropdownMenuItem
            key={d.id}
            onSelect={() => dispatch({ type: 'setDefense', slot, equipmentId: d.id })}
          >
            <span className="type-body-sm text-text-strong">{d.name}</span>
          </DropdownMenuItem>
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
                return (
                  <DropdownMenuItem
                    key={u.id}
                    disabled={usedElsewhere}
                    onSelect={() =>
                      dispatch({ type: 'setUtility', slot, index, equipmentId: u.id })
                    }
                    className={cn(usedElsewhere && 'opacity-40')}
                  >
                    <span className="type-body-sm text-text-strong">{u.name}</span>
                    {usedElsewhere && (
                      <span className="type-eyebrow ml-auto text-text-faint">EQUIPPED</span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </FieldSelect>
          </div>
        );
      })}
    </div>
  );
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
    </div>
  );
}
