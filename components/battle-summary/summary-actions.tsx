/**
 * `SummaryActions` (Feature 6, T022) — the loop-closing action row from `vm.actions`: Find Next
 * Opponent (the primary CTA → Arena, Feature 8) and Back to Arena. The Watch Full Replay CTA moved
 * up into the `OutcomeHero` (above the fold) so it's the obvious first action; this footer is now
 * pure forward-navigation. All are `next/link`s styled as Feature 3 `Button`s — keyboard-operable
 * with visible focus. **No replay player is mounted here** (SC-007); these only navigate. Full-width
 * stacked in portrait, a centered row in landscape (D4).
 */

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import type { BattleSummaryViewModel } from '@/lib/battle-summary/view-model';
import { cn } from '@/lib/utils';

export interface SummaryActionsProps {
  actions: BattleSummaryViewModel['actions'];
  className?: string;
}

export function SummaryActions({ actions, className }: SummaryActionsProps) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center', className)}>
      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link href={actions.findNextOpponentHref}>Find Next Opponent →</Link>
      </Button>
      <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
        <Link href={actions.backHref}>Back to Arena</Link>
      </Button>
    </div>
  );
}
