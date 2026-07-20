/**
 * `MatchTotals` (Feature 6, T017) — the you-vs-them comparison: damage dealt, units killed, units
 * lost, and average hull left, each a centered dual bar (viewer = friendly cyan on the left filling
 * toward center, opponent = enemy tint on the right). Values equal the result (SC-003); each bar pair
 * is normalized to the larger of the two so the leader reads full. Pure render; token-only. Stacks
 * cleanly at narrow widths (the `1fr / label / 1fr` grid, D4).
 */

import { milliToWhole } from '@/lib/battle-summary/format';
import type { BattleSummaryViewModel } from '@/lib/battle-summary/view-model';
import { cn } from '@/lib/utils';

export interface MatchTotalsProps {
  totals: BattleSummaryViewModel['totals'];
  className?: string;
}

type Row = { label: string; viewer: number; opponent: number; fmt: (n: number) => string };

const pct = (value: number, max: number) => (max > 0 ? Math.round((value / max) * 100) : 0);

function Bar({ value, max, side }: { value: number; max: number; side: 'viewer' | 'opponent' }) {
  return (
    <div
      className={cn(
        'flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-track',
        side === 'viewer' ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn('h-full rounded-full', side === 'viewer' ? 'bg-faction-friendly' : 'bg-faction-enemy')}
        style={{ width: `${pct(value, max)}%` }}
      />
    </div>
  );
}

export function MatchTotals({ totals, className }: MatchTotalsProps) {
  const fmtWhole = (n: number) => n.toLocaleString();
  const rows: Row[] = [
    { label: 'DAMAGE DEALT', viewer: milliToWhole(totals.damageDealt.viewer), opponent: milliToWhole(totals.damageDealt.opponent), fmt: fmtWhole },
    { label: 'UNITS KILLED', viewer: totals.unitsKilled.viewer, opponent: totals.unitsKilled.opponent, fmt: fmtWhole },
    { label: 'UNITS LOST', viewer: totals.unitsLost.viewer, opponent: totals.unitsLost.opponent, fmt: fmtWhole },
    { label: 'AVG HULL LEFT', viewer: totals.avgHullLeft.viewer, opponent: totals.avgHullLeft.opponent, fmt: (n) => `${n}%` },
  ];

  return (
    <div className={cn('flex flex-col gap-4 rounded-xl border border-border bg-surface-rail p-5 sm:p-6', className)}>
      {rows.map((row) => {
        const max = Math.max(row.viewer, row.opponent);
        return (
          <div key={row.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="type-label w-14 shrink-0 text-right text-sm text-text-strong tabular-nums">
                {row.fmt(row.viewer)}
              </span>
              <Bar value={row.viewer} max={max} side="viewer" />
            </div>
            <span className="type-eyebrow px-1 text-center text-[0.625rem] text-text-muted">{row.label}</span>
            <div className="flex min-w-0 items-center gap-2.5">
              <Bar value={row.opponent} max={max} side="opponent" />
              <span className="type-label w-14 shrink-0 text-sm text-text-strong tabular-nums">
                {row.fmt(row.opponent)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
