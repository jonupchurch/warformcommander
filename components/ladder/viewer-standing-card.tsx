/**
 * `ViewerStandingCard` (Feature 9, T017 — US1) — the pinned "your standing" card, always on-screen so
 * the viewer finds their rank in ≤1 interaction (SC-004, FR-004). Ranked → rank + net victories + a
 * "jump to my rank" anchor; unranked → the Arena CTA (FR-012); anonymous → a sign-in prompt. Never a
 * fabricated rank.
 */

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { cn } from '@/lib/utils';
import type { ViewerStandingVM } from './view-model';

export interface ViewerStandingCardProps {
  viewer: ViewerStandingVM | null; // null = anonymous
  className?: string;
}

export function ViewerStandingCard({ viewer, className }: ViewerStandingCardProps) {
  if (viewer === null) {
    return (
      <Panel inset="raised" eyebrow="YOUR STANDING" className={cn('flex flex-col gap-3', className)}>
        <p className="type-body text-sm text-text-muted">Sign in to see your rank on the board.</p>
        <Button asChild variant="secondary" size="sm" className="w-full sm:w-auto">
          <Link href="/api/auth/signin">Sign in</Link>
        </Button>
      </Panel>
    );
  }

  if (viewer.state === 'unranked') {
    return (
      <Panel inset="raised" eyebrow="YOUR STANDING" className={cn('flex flex-col gap-3', className)}>
        <p className="type-body text-sm text-text-muted">
          No ranked matches yet — win an Arena attack to earn a place on the ladder.
        </p>
        <Button asChild size="sm" className="w-full sm:w-auto">
          <Link href={viewer.ctaHref}>Enter the Arena →</Link>
        </Button>
      </Panel>
    );
  }

  const { row } = viewer;
  return (
    <Panel
      inset="raised"
      eyebrow="YOUR STANDING"
      className={cn('flex items-center justify-between gap-4', className)}
    >
      <div className="flex items-baseline gap-3">
        <span className="type-display text-2xl text-faction-friendly">#{row.rank}</span>
        <div className="flex flex-col">
          <span className="type-readout text-sm text-text-strong">{row.handle}</span>
          <span className="type-readout text-[0.625rem] tabular-nums text-text-muted">{row.record}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span
          className={cn(
            'type-readout text-lg tabular-nums',
            row.netVictories < 0 ? 'text-faction-enemy' : 'text-text-strong',
          )}
        >
          {row.netVictoriesLabel}
        </span>
        <a
          href="#my-rank"
          className="type-eyebrow text-[0.5rem] text-faction-friendly underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          JUMP TO MY RANK
        </a>
      </div>
    </Panel>
  );
}
