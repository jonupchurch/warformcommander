/**
 * `NetVictoryExplainer` (Feature 9, T033 — US4) — the always-available inline explainer of the ranking
 * model: net victories = attack wins − defense losses, and **defense losses subtract** (a weak defense
 * bleeds rank, §13). Placed near the viewer's own standing so a negative total's cause is legible. Uses
 * a real minus sign, states the subtract rule in words, and collapses without overflowing in portrait.
 */

import { Panel } from '@/components/ui/panel';
import { cn } from '@/lib/utils';

export function NetVictoryExplainer({ className }: { className?: string }) {
  return (
    <Panel inset="sunken" className={cn('flex flex-col gap-2', className)}>
      <span className="type-eyebrow text-text-muted">HOW RANK WORKS</span>
      <p className="type-readout text-sm text-text-strong">
        net victories = attack wins − defense losses
      </p>
      <p className="type-body text-xs text-text-muted">
        Winning an attack adds a net victory; losing on defense <strong className="text-faction-enemy">subtracts</strong>{' '}
        one. A weak defense bleeds rank, so a commander can sit below zero — defense losses subtract
        straight off the top.
      </p>
    </Panel>
  );
}
