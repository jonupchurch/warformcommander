/**
 * `LadderTable` (Feature 9, T014 — US1, landscape) — the dense leaderboard table, `hidden lg:block`.
 * Columns RANK · COMMANDER · RECORD · STREAK · <metric>. The viewer's own row gets a cyan edge + tint
 * so it's findable at a glance. The table scrolls inside its own `overflow-x-auto` container so a wide
 * board never pushes the page into horizontal overflow (SC-003). Token-only.
 */

import Link from 'next/link';

import type { LadderRow } from './view-model';
import { METRIC_LABEL } from './metric-labels';
import { cn } from '@/lib/utils';

export interface LadderTableProps {
  rows: LadderRow[];
  className?: string;
}

export function LadderTable({ rows, className }: LadderTableProps) {
  const metricLabel = rows[0] ? METRIC_LABEL[rows[0].metric] : 'NET VICTORIES';
  return (
    <div className={cn('hidden overflow-x-auto rounded-xl border border-border bg-surface-rail lg:block', className)}>
      <table className="w-full min-w-[40rem] border-collapse">
        <thead>
          <tr className="type-eyebrow text-text-muted">
            <th className="px-4 py-3 text-left font-normal">RANK</th>
            <th className="px-4 py-3 text-left font-normal">COMMANDER</th>
            <th className="px-4 py-3 text-left font-normal">RECORD</th>
            <th className="px-4 py-3 text-left font-normal">STREAK</th>
            <th className="px-4 py-3 text-right font-normal">{metricLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.userId}
              data-viewer={r.isViewer || undefined}
              className={cn(
                'border-t border-border/60',
                r.isViewer && 'bg-faction-friendly-soft shadow-[inset_3px_0_0_0_var(--color-faction-friendly)]',
              )}
            >
              <td className="px-4 py-3">
                <span className="type-readout tabular-nums text-text-muted">#{r.rank}</span>
              </td>
              <td className="px-4 py-3">
                <Link
                  href={r.profileHref}
                  className="type-readout text-text-strong underline-offset-4 hover:text-faction-friendly hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {r.handle}
                </Link>
                {r.isBot && <span className="type-eyebrow ml-2 text-[0.5rem] text-text-muted">BOT</span>}
                {r.isViewer && <span className="type-eyebrow ml-2 text-[0.5rem] text-faction-friendly">YOU</span>}
              </td>
              <td className="px-4 py-3">
                <span className="type-readout text-xs tabular-nums text-text-muted">{r.record}</span>
              </td>
              <td className="px-4 py-3">
                <span className="type-readout text-xs tabular-nums text-text-muted">
                  {r.streak.current} <span className="text-text-muted/60">/ {r.streak.best}</span>
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={cn(
                    'type-readout tabular-nums',
                    r.metric === 'net' && r.netVictories < 0 ? 'text-faction-enemy' : 'text-text-strong',
                  )}
                >
                  {r.metricValueLabel}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
