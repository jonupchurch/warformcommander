/**
 * `ActivityChart` (Feature 10, T020 — US2) — recent-weeks W/L as CSS/flex bars (no chart library). A
 * green win segment over a red loss segment per week; an all-zero week renders a faint baseline. Pure
 * render from `WeekBucket[]`; responsive, no 360px overflow.
 */

import { cn } from '@/lib/utils';
import type { WeekBucket } from '@/lib/profile-types';

export function ActivityChart({ weeks }: { weeks: WeekBucket[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.wins + w.losses));
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-eyebrow text-text-muted">ACTIVITY · LAST {weeks.length} WEEKS</h2>
      <div className="flex items-end gap-1.5 rounded-lg border border-border bg-surface-rail p-3" style={{ height: '5.5rem' }}>
        {weeks.map((w) => {
          const total = w.wins + w.losses;
          return (
            <div key={w.label} className="flex flex-1 flex-col items-center gap-1" title={`${w.label}: ${w.wins}W ${w.losses}L`}>
              <div className="flex w-full flex-1 flex-col justify-end">
                {total === 0 ? (
                  <div className="h-0.5 w-full rounded-full bg-border" />
                ) : (
                  <div className="flex w-full flex-col overflow-hidden rounded-sm" style={{ height: `${(total / max) * 100}%` }}>
                    <div className="w-full bg-faction-friendly" style={{ flexGrow: w.wins }} />
                    <div className="w-full bg-faction-enemy" style={{ flexGrow: w.losses }} />
                  </div>
                )}
              </div>
              <span className={cn('type-eyebrow text-[0.45rem] text-text-muted')}>{w.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
