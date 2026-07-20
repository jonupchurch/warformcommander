/**
 * `StandingDelta` (Feature 6, T025) — the net-victory swing panel slotted into the {@link OutcomeHero}
 * from `vm.standing`: `+1 NET VICTORY` + `47 → 48` for a ranked match, or `UNRANKED` for a practice
 * match. **No MMR/tier** is shown here — that is Feature 9 (D2). Renders nothing without a standing.
 * Pure render; token-only.
 */

import type { BattleSummaryViewModel } from '@/lib/battle-summary/view-model';
import { cn } from '@/lib/utils';

export interface StandingDeltaProps {
  standing: BattleSummaryViewModel['standing'];
  className?: string;
}

export function StandingDelta({ standing, className }: StandingDeltaProps) {
  if (!standing) return null;

  const gained = standing.mode === 'ranked' && (standing.delta ?? 0) > 0;
  const showRange =
    standing.mode === 'ranked' && standing.before !== undefined && standing.after !== undefined;

  return (
    <div
      className={cn(
        'flex flex-col items-start gap-1 rounded-xl border px-4 py-3',
        gained ? 'border-faction-friendly/30 bg-faction-friendly-soft' : 'border-border bg-surface-rail',
        className,
      )}
    >
      <span className={cn('type-eyebrow text-[0.625rem]', gained ? 'text-faction-friendly' : 'text-text-muted')}>
        {standing.mode === 'ranked' ? 'LADDER' : 'PRACTICE'}
      </span>
      <span className={cn('type-label text-sm', gained ? 'text-faction-friendly' : 'text-text-strong')}>
        {standing.label}
      </span>
      {showRange && (
        <span className="type-readout text-xs text-text-muted tabular-nums">
          {standing.before} → {standing.after}
        </span>
      )}
    </div>
  );
}
