/**
 * `MetricTabs` (Feature 9, T025 — US2) + `RangeTabs` (T030 — US3). Link-based tab rows that re-order
 * the board by metric (net/damage/defenses) or switch the range (season/week/month) via the URL — a
 * server round-trip, so they work without client JS and stay keyboard/`aria-current` accessible.
 * Net Victories stays the primary stake (FR-007): it's the first, default metric.
 */

import Link from 'next/link';

import type { LadderMetric, LadderRange } from '@/server/ladder/queries';
import { METRIC_LABEL, RANGE_LABEL } from './metric-labels';
import { cn } from '@/lib/utils';

const METRICS: LadderMetric[] = ['net', 'damage', 'defenses'];
const RANGES: LadderRange[] = ['season', 'week', 'month'];

function Tab({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'type-eyebrow inline-flex h-8 items-center rounded-md px-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        active
          ? 'bg-faction-friendly text-void'
          : 'border border-border text-text-muted hover:bg-surface-raised hover:text-text-strong',
      )}
    >
      {label}
    </Link>
  );
}

export function MetricTabs({ current, hrefFor }: { current: LadderMetric; hrefFor: (m: LadderMetric) => string }) {
  return (
    <div role="group" aria-label="Rank by" className="flex flex-wrap gap-2">
      {METRICS.map((m) => (
        <Tab key={m} label={METRIC_LABEL[m]} active={m === current} href={hrefFor(m)} />
      ))}
    </div>
  );
}

export function RangeTabs({ current, hrefFor }: { current: LadderRange; hrefFor: (r: LadderRange) => string }) {
  return (
    <div role="group" aria-label="Time range" className="flex flex-wrap gap-2">
      {RANGES.map((r) => (
        <Tab key={r} label={RANGE_LABEL[r]} active={r === current} href={hrefFor(r)} />
      ))}
    </div>
  );
}
