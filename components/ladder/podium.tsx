/**
 * `Podium` (Feature 9, T016 — US1) — the top-3, rank 1 emphasized, consistent with the ordered board
 * (it renders the first three rows). Both orientations: a centered 2-1-3 arrangement in landscape,
 * a simple stacked list feel in portrait via wrapping. Token-only; the viewer's own podium slot keeps
 * the cyan highlight.
 */

import Link from 'next/link';

import type { LadderRow } from './view-model';
import { METRIC_LABEL } from './metric-labels';
import { cn } from '@/lib/utils';

export interface PodiumProps {
  rows: LadderRow[];
  className?: string;
}

const ORDER = [1, 0, 2]; // visual 2nd · 1st · 3rd
const MEDAL = ['①', '②', '③'];

function Plinth({ r, place }: { r: LadderRow; place: number }) {
  const first = place === 0;
  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center gap-1 rounded-xl border px-3 py-4 text-center',
        first ? 'sm:-translate-y-2' : '',
        r.isViewer ? 'border-faction-friendly bg-faction-friendly-soft' : 'border-border bg-surface-rail',
      )}
    >
      <span className={cn('type-display', first ? 'text-2xl text-faction-friendly' : 'text-xl text-text-strong')}>
        {MEDAL[place]}
      </span>
      <Link
        href={r.profileHref}
        className="type-readout max-w-full truncate text-sm text-text-strong underline-offset-4 hover:text-faction-friendly hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {r.handle}
      </Link>
      <span
        className={cn(
          'type-readout text-base tabular-nums',
          r.metric === 'net' && r.netVictories < 0 ? 'text-faction-enemy' : 'text-text-strong',
        )}
      >
        {r.metricValueLabel}
      </span>
      <span className="type-eyebrow text-[0.5rem] text-text-muted">{METRIC_LABEL[r.metric]}</span>
    </div>
  );
}

export function Podium({ rows, className }: PodiumProps) {
  const top = ORDER.map((i) => rows[i]).filter((r): r is LadderRow => Boolean(r));
  if (top.length === 0) return null;
  return (
    <div className={cn('flex items-stretch justify-center gap-3', className)}>
      {top.map((r) => (
        <Plinth key={r.userId} r={r} place={r.rank - 1} />
      ))}
    </div>
  );
}
