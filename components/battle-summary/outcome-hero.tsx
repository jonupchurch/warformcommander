/**
 * `OutcomeHero` (Feature 6, T011) — the top of the summary: the `BEST OF 3` eyebrow, the big
 * `VICTORY`/`DEFEAT` verdict (as text, not color-only — FR-016), the `Won 2 – 1 vs <opponent>` line,
 * and the {@link SeriesPips}. `children` is the slot for the US4 `StandingDelta`. Pure render;
 * token-only. The verdict is the page's `h1` heading landmark (T030).
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BattleSummaryViewModel } from '@/lib/battle-summary/view-model';
import { SeriesPips } from './series-pips';

export interface OutcomeHeroProps {
  outcome: BattleSummaryViewModel['outcome'];
  series: BattleSummaryViewModel['series'];
  /** Battle Playback route for this match — the primary "watch the replay" CTA lives up here in the
   * hero (above the fold), not only in the footer action row (SC-007: a link, no player mounted). */
  watchReplayHref: string;
  /** Arena route — the "leave" action, kept directly under Watch Replay so exiting doesn't require a
   * scroll to the footer (mirrors how Watch Replay itself was lifted out of `SummaryActions`). */
  backHref: string;
  /** US4 standing panel slot. */
  children?: ReactNode;
  className?: string;
}

export function OutcomeHero({ outcome, series, watchReplayHref, backHref, children, className }: OutcomeHeroProps) {
  const won = outcome.verdict === 'VICTORY';
  const opponentName = outcome.opponent.hidden
    ? 'Practice Opponent'
    : (outcome.opponent.name ?? 'Opponent');

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-surface-sunken px-6 py-8 sm:px-10 sm:py-10',
        won ? 'border-faction-friendly/30' : 'border-faction-enemy/30',
        className,
      )}
    >
      {/* Soft directional glow — decorative, motion-agnostic (static gradient). */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 opacity-60',
          won
            ? 'bg-[radial-gradient(120%_160%_at_0%_0%,var(--color-faction-friendly-soft),transparent_55%)]'
            : 'bg-[radial-gradient(120%_160%_at_0%_0%,var(--color-faction-enemy-soft),transparent_55%)]',
        )}
      />

      <div className="relative flex flex-col gap-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex flex-col gap-5">
            <span className="type-eyebrow text-faction-friendly">MATCH COMPLETE · BEST OF {outcome.bestOf}</span>
            <h1
              className={cn(
                'type-display leading-none text-text-strong',
                won && 'motion-safe:[text-shadow:0_0_30px_var(--color-faction-friendly-soft)]',
              )}
            >
              {outcome.verdict}
            </h1>
          </div>

          {/* Primary CTA + the "leave" action, kept high in the hero so watching the replay is the
              obvious first action and exiting doesn't require a scroll to the footer (both were
              previously only below the fold). Stretch to equal width; full-width in portrait. */}
          <div className="flex flex-col gap-3 sm:shrink-0">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={watchReplayHref}>► Watch Full Replay</Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
              <Link href={backHref}>Back to Arena</Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <SeriesPips series={series} />
          <div className="flex flex-col gap-1">
            <span className="type-readout text-sm text-text-muted">
              {won ? 'Won' : 'Lost'}{' '}
              <span className="font-bold text-text-strong">{outcome.seriesLabel}</span>
            </span>
            <span className="type-readout text-xs text-text-muted">
              vs <span className="max-w-[24ch] truncate text-faction-enemy">{opponentName}</span>
            </span>
          </div>
          {children && <div className="sm:ml-auto">{children}</div>}
        </div>
      </div>
    </section>
  );
}
