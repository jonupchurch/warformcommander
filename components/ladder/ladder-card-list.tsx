/**
 * `LadderCardList` (Feature 9, T015 — US1, portrait) — the leaderboard as stacked cards, `lg:hidden`.
 * Each card leads with rank + handle, the **selected metric** as the prominent figure, record + streak
 * secondary. The viewer's own card gets the cyan highlight. No table exists in portrait (SC-003).
 */

import Link from 'next/link';

import type { LadderRow } from './view-model';
import { METRIC_LABEL } from './metric-labels';
import { cn } from '@/lib/utils';

export interface LadderCardListProps {
  rows: LadderRow[];
  className?: string;
}

function LadderCard({ r }: { r: LadderRow }) {
  const negativeNet = r.metric === 'net' && r.netVictories < 0;
  return (
    <li
      data-viewer={r.isViewer || undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg border px-4 py-3',
        r.isViewer
          ? 'border-faction-friendly bg-faction-friendly-soft'
          : 'border-border bg-surface-rail',
      )}
    >
      <span className="type-readout w-9 shrink-0 text-center text-sm tabular-nums text-text-muted">#{r.rank}</span>
      <div className="flex min-w-0 flex-col">
        <Link
          href={r.profileHref}
          className="type-readout truncate text-sm text-text-strong underline-offset-4 hover:text-faction-friendly hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {r.handle}
          {r.isViewer && <span className="type-eyebrow ml-2 text-[0.5rem] text-faction-friendly">YOU</span>}
          {r.isBot && !r.isViewer && <span className="type-eyebrow ml-2 text-[0.5rem] text-text-muted">BOT</span>}
        </Link>
        <span className="type-readout text-[0.625rem] tabular-nums text-text-muted">
          {r.record} · streak {r.streak.current}/{r.streak.best}
        </span>
      </div>
      <div className="ml-auto flex flex-col items-end">
        <span className={cn('type-readout text-lg tabular-nums', negativeNet ? 'text-faction-enemy' : 'text-text-strong')}>
          {r.metricValueLabel}
        </span>
        <span className="type-eyebrow text-[0.5rem] text-text-muted">{METRIC_LABEL[r.metric]}</span>
      </div>
    </li>
  );
}

export function LadderCardList({ rows, className }: LadderCardListProps) {
  return (
    <ul className={cn('flex flex-col gap-2 lg:hidden', className)}>
      {rows.map((r) => (
        <LadderCard key={r.userId} r={r} />
      ))}
    </ul>
  );
}
