/**
 * `PerMachineFates` (Feature 6, T018) — the fate rows from `vm.perMachine`, grouped by side: each row
 * is the Feature 3 `UnitIcon` (type, faction tint), the variant name, and the fate (`destroyed 3.1s`
 * or `survived 41% hull`). Pure render; token-only. The destroyed-at-tick-0 / survived-at-100%
 * extremes render like any other.
 */

import { UnitIcon } from '@/components/brand/unit-icon';
import type { BattleSummaryViewModel } from '@/lib/battle-summary/view-model';
import { cn } from '@/lib/utils';
import { MACHINE_LABEL } from './machine-name';

export interface PerMachineFatesProps {
  perMachine: BattleSummaryViewModel['perMachine'];
  className?: string;
}

type Row = BattleSummaryViewModel['perMachine'][number];

function fateText(fate: Row['fate']): string {
  return fate.kind === 'destroyed' ? `destroyed ${fate.atSeconds}` : `survived ${fate.hullPct}% hull`;
}

function FateRow({ row }: { row: Row }) {
  const faction = row.side === 'viewer' ? 'friendly' : 'enemy';
  const label = MACHINE_LABEL[row.typeKey];
  const destroyed = row.fate.kind === 'destroyed';
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-surface-sunken/50 px-3 py-2">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md border p-1',
          faction === 'friendly'
            ? 'border-faction-friendly/30 bg-faction-friendly-soft'
            : 'border-faction-enemy/30 bg-faction-enemy-soft',
        )}
      >
        <UnitIcon type={row.typeKey} faction={faction} title={`${label} ${row.variant}`} className="h-full w-full" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="type-readout truncate text-xs text-text-strong">{row.variant}</span>
        <span className="type-eyebrow text-[0.5rem] text-text-muted">{label}</span>
      </div>
      <span
        className={cn(
          'type-readout ml-auto shrink-0 text-xs tabular-nums',
          destroyed ? 'text-faction-enemy' : 'text-text-muted',
        )}
      >
        {fateText(row.fate)}
      </span>
    </li>
  );
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="type-eyebrow text-[0.625rem] text-text-muted">{title}</h3>
      <ul className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <FateRow key={`${row.side}-${row.variant}-${i}`} row={row} />
        ))}
      </ul>
    </div>
  );
}

export function PerMachineFates({ perMachine, className }: PerMachineFatesProps) {
  const viewer = perMachine.filter((m) => m.side === 'viewer');
  const opponent = perMachine.filter((m) => m.side === 'opponent');
  return (
    <div className={cn('grid gap-5 rounded-xl border border-border bg-surface-rail p-5 sm:grid-cols-2 sm:p-6', className)}>
      <Group title="YOUR MACHINES" rows={viewer} />
      <Group title="ENEMY MACHINES" rows={opponent} />
    </div>
  );
}
