'use client';

/**
 * The right rail (T019) — the selected machine's 7 `StatBar`s (from the shared derivation, so they
 * equal the engine, SC-002), its loadout rows, and the 4 behavior-dial tiles, plus MOVE (tap-to-place)
 * and REMOVE. Deep loadout/dial editing is the Customize surface (US2/US3); this pane is the readout.
 */

import { UnitIcon } from '@/components/brand/unit-icon';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Panel } from '@/components/ui/panel';
import { SectionLabel } from '@/components/ui/section-label';
import { Stat } from '@/components/ui/stat';
import { StatBar } from '@/components/ui/stat-bar';
import {
  FAMILY_TEXT_CLASS,
  MACHINE_TYPE_LABEL,
  UNIT_ICON_KEY,
  ZONE_LABEL,
  dialTiles,
  familyTone,
  statBars,
  zoneTone,
} from '@/lib/garage/display';
import { useGarageEditor } from '@/lib/garage/use-garage-editor';
import { cn } from '@/lib/utils';

import { CustomizeSurface } from './customize-surface';

export function UnitDetailPanel() {
  const { session, dispatch, ruleset, preview } = useGarageEditor();
  const slot = session.selection.selectedSlot;
  const machine = slot === null ? null : session.draft.machines[slot];

  if (machine === null || slot === null) {
    return (
      <Panel as="aside" inset="rail" className="flex flex-col gap-3" aria-label="Unit detail">
        <SectionLabel rule={false}>Unit Detail</SectionLabel>
        <p className="type-body-sm text-text-muted">
          Select a machine on the formation board to inspect its stats, loadout, and behavior.
        </p>
      </Panel>
    );
  }

  const effective = preview.effective;
  const family = effective?.family ?? null;
  const bars = effective ? statBars(effective) : [];
  const dials = dialTiles(machine.dials);
  const loadoutRows: Array<{ label: string; id: string; tone: string }> = [
    { label: 'WEAPON', id: machine.loadout.weapon, tone: 'text-faction-friendly' },
    { label: 'DEFENSE', id: machine.loadout.defense, tone: 'text-family-explosive' },
    ...machine.loadout.utilities.map((id, i) => ({
      label: `UTILITY ${i + 1}`,
      id,
      tone: 'text-text-muted',
    })),
  ];

  return (
    <Panel as="aside" inset="rail" className="flex flex-col gap-4" aria-label="Unit detail">
      <SectionLabel rule={false}>Unit Detail</SectionLabel>

      <div className="flex items-center gap-3">
        <UnitIcon
          type={UNIT_ICON_KEY[machine.typeId]}
          className={cn('w-16', family ? FAMILY_TEXT_CLASS[family] : 'text-text-muted')}
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="type-h3 truncate text-text-strong">{machine.variantId}</span>
          <span className="type-body-sm text-text-muted">{MACHINE_TYPE_LABEL[machine.typeId]}</span>
          <div className="flex flex-wrap gap-1.5">
            {family && <Chip tone={familyTone(family)}>{family.toUpperCase()}</Chip>}
            <Chip tone={zoneTone(machine.zone)}>{ZONE_LABEL[machine.zone]} ZONE</Chip>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel index="01">Stats</SectionLabel>
        <div className="flex flex-col gap-2.5">
          {bars.map((b) => (
            <StatBar key={b.label} label={b.label} value={b.value} max={b.max} display={b.display} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel index="02">Loadout</SectionLabel>
        {loadoutRows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <span className={cn('type-label', row.tone)}>{row.label}</span>
            <span className="type-body-sm text-text-strong">
              {ruleset.equipment[row.id]?.name ?? row.id}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel index="03">Behavior Dials</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {dials.map((d) => (
            <Stat key={d.label} label={d.label} value={d.value} />
          ))}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <CustomizeSurface />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => dispatch({ type: 'pickUpForPlacement', slot })}
          >
            MOVE
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: 'clearSlot', slot })}
          >
            REMOVE
          </Button>
        </div>
      </div>
    </Panel>
  );
}
