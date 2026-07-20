'use client';

/**
 * One formation zone (T018) — its cap label + the machines placed in it as selectable chips, plus a
 * **PLACE HERE** drop target that only appears while a machine is picked up and this zone is a legal
 * destination (home-zone + not full). Caps are enforced by *disabling* placement, not rejecting it
 * ([research B1]).
 */

import { UnitIcon } from '@/components/brand/unit-icon';
import {
  FAMILY_TEXT_CLASS,
  ZONE_BORDER_CLASS,
  ZONE_CAP,
  ZONE_LABEL,
  UNIT_ICON_KEY,
} from '@/lib/garage/display';
import { useGarageEditor } from '@/lib/garage/use-garage-editor';
import type { DraftMachine, SlotIndex } from '@/lib/garage/types';
import { deriveEffectiveStats } from '@/sim/derive';
import type { ZoneId } from '@/sim/model';
import { cn } from '@/lib/utils';

/** A placed machine, selectable to open its detail. */
function MachineChip({ slot, machine }: { slot: SlotIndex; machine: DraftMachine }) {
  const { session, dispatch, ruleset } = useGarageEditor();
  const selected = session.selection.selectedSlot === slot;
  const derived = deriveEffectiveStats(machine, ruleset);
  const family = derived.ok ? derived.stats.family : null;

  return (
    <button
      type="button"
      onClick={() => dispatch({ type: 'selectMachine', slot })}
      aria-pressed={selected}
      className={cn(
        'flex items-center gap-2 rounded-md border bg-surface px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        selected ? 'border-faction-friendly motion-safe:shadow-glow-soft' : 'border-border hover:bg-surface-raised',
      )}
    >
      <UnitIcon
        type={UNIT_ICON_KEY[machine.typeId]}
        className={cn('w-9', family ? FAMILY_TEXT_CLASS[family] : 'text-text-muted')}
      />
      <span className="flex flex-col">
        <span className="type-label text-text-strong">{machine.variantId}</span>
        {family && <span className="type-eyebrow text-text-dim">{family.toUpperCase()}</span>}
      </span>
    </button>
  );
}

export function ZoneRow({ zone }: { zone: ZoneId }) {
  const { session, dispatch, ruleset } = useGarageEditor();

  const placed = session.draft.machines
    .map((machine, slot) => ({ machine, slot: slot as SlotIndex }))
    .filter((x): x is { machine: DraftMachine; slot: SlotIndex } => x.machine !== null && x.machine.zone === zone);

  const cap = ZONE_CAP[zone];
  const over = placed.length > cap;

  const placingSlot = session.selection.placingSlot;
  const placing = placingSlot !== null ? session.draft.machines[placingSlot] : null;
  const canPlaceHere =
    placing !== null &&
    (ruleset.machineTypes[placing.typeId]?.homeZones.includes(zone) ?? false) &&
    placing.zone !== zone &&
    placed.length < cap;

  return (
    <div
      className={cn(
        'grid grid-cols-[88px_1fr] gap-3 rounded-lg border border-border border-l-2 bg-surface-sunken p-3',
        ZONE_BORDER_CLASS[zone],
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="type-label text-text-strong">{ZONE_LABEL[zone]}</span>
        <span className={cn('type-eyebrow', over ? 'text-faction-enemy' : 'text-text-dim')}>
          {placed.length}/{cap}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {placed.length === 0 && !canPlaceHere && (
          <span className="type-body-sm text-text-faint">— empty —</span>
        )}
        {placed.map(({ machine, slot }) => (
          <MachineChip key={slot} slot={slot} machine={machine} />
        ))}
        {canPlaceHere && placingSlot !== null && (
          <button
            type="button"
            onClick={() => dispatch({ type: 'placeInZone', slot: placingSlot, zone })}
            aria-label={`Place ${placing?.variantId ?? 'unit'} in ${ZONE_LABEL[zone]}`}
            className="rounded-md border border-dashed border-faction-friendly px-3 py-2 type-eyebrow text-faction-friendly transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            PLACE HERE
          </button>
        )}
      </div>
    </div>
  );
}
