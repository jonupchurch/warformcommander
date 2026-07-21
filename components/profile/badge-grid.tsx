/**
 * `BadgeGrid` (Feature 10, T029 — US4) — the derived, cosmetic badges: earned tiles (bright) and
 * in-progress tiles (dim + a progress bar). The header shows the earned count. Every value comes from
 * the pure `deriveBadges` — nothing here reads or writes a store (SC-004/SC-005). Responsive 4→2→1.
 */

import { Star } from 'lucide-react';

import { UnitIcon } from '@/components/brand/unit-icon';
import type { BadgeIcon, BadgeView } from '@/lib/profile-types';
import { cn } from '@/lib/utils';

function Icon({ icon, earned }: { icon: BadgeIcon; earned: boolean }) {
  const cls = cn('size-6', earned ? 'text-faction-friendly' : 'text-text-muted');
  if (icon.kind === 'star') return <Star className={cls} aria-hidden />;
  return <UnitIcon type={icon.type} className={cls} />;
}

function BadgeTile({ badge }: { badge: BadgeView }) {
  const earned = badge.state === 'earned';
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3',
        earned ? 'border-faction-friendly/40 bg-faction-friendly-soft' : 'border-border bg-surface-sunken/50 opacity-80',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-md border', earned ? 'border-faction-friendly/40' : 'border-border')}>
          <Icon icon={badge.icon} earned={earned} />
        </span>
        <span className="type-readout truncate text-sm text-text-strong">{badge.name}</span>
      </div>
      <p className="type-body text-[0.625rem] text-text-muted">{badge.desc}</p>
      {earned ? (
        <span className="type-eyebrow text-[0.5rem] text-faction-friendly">EARNED</span>
      ) : (
        <div className="flex flex-col gap-1">
          <div role="progressbar" aria-valuenow={Math.round(badge.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={badge.name} className="h-1 overflow-hidden rounded-full bg-track">
            <div className="h-full rounded-full bg-faction-friendly/60" style={{ width: `${badge.progress * 100}%` }} />
          </div>
          <span className="type-eyebrow text-[0.45rem] tabular-nums text-text-muted">{badge.progressText}</span>
        </div>
      )}
    </div>
  );
}

export function BadgeGrid({ badges }: { badges: BadgeView[] }) {
  const earnedCount = badges.filter((b) => b.state === 'earned').length;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="type-eyebrow text-text-muted">BADGES</h2>
        <span className="type-eyebrow text-text-muted">{earnedCount} / {badges.length} EARNED</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {badges.map((b) => (
          <BadgeTile key={b.id} badge={b} />
        ))}
      </div>
    </section>
  );
}
