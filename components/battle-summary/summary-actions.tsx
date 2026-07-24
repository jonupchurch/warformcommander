/**
 * `SummaryActions` (Feature 6, T022) — the loop-closing action row from `vm.actions`: Find Next
 * Opponent (the primary CTA → Arena, Feature 8). The Watch Full Replay and Back to Arena CTAs both
 * moved up into the `OutcomeHero` (above the fold) so watching is the obvious first action and
 * leaving doesn't require a scroll; this footer is now the single forward CTA. A `next/link` styled
 * as a Feature 3 `Button` — keyboard-operable with visible focus. **No replay player is mounted
 * here** (SC-007); it only navigates. Full-width in portrait, centered in landscape (D4).
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
    </div>
  );
}
