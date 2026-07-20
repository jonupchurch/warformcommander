/**
 * `BattleStage` (Feature 5, T014) — the whole two-side, 4-zone battlefield for one tick. **Pure
 * render** of a {@link BattleViewModel}: no state, no loop, no engine (this is the swappable render
 * seam — a Canvas backend could replace it behind the same `(view, progress)` props without touching
 * seek/loop logic; not built — YAGNI).
 *
 * Layout (FR-005, §4/mockup): each side is an Air row over three ground zones ordered **toward the
 * contact line** (player `Rear→Middle→Front`, enemy `Front→Middle→Rear`, already ordered by
 * `sim/replay-view.ts`), so both Fronts meet at the center strip. DOM/flex/grid from one markup so
 * both orientations lay out from the same tree (P7); `minmax(0,1fr)` columns shrink rather than
 * overflow (SC-004). Token-only; no raw hex.
 */

import type { BattleViewModel, SideView } from '@/sim/replay-view';
import { cn } from '@/lib/utils';
import { ContactLine } from './contact-line';
import { ZoneColumn } from './zone-column';

export interface BattleStageProps {
  view: BattleViewModel;
  /** currentTick / lastTick → the contact-line node position. */
  progress: number;
  className?: string;
}

function SideColumn({ side, view }: { side: 'friendly' | 'enemy'; view: SideView }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 p-2 sm:p-3">
      <ZoneColumn zone="Air" side={side} units={view.air} isEmpty={view.airEmpty} />
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2">
        {view.ground.map((z) => (
          <ZoneColumn key={z.zone} zone={z.zone} side={side} units={z.units} isEmpty={z.isEmpty} />
        ))}
      </div>
    </div>
  );
}

export function BattleStage({ view, progress, className }: BattleStageProps) {
  return (
    <div
      data-slot="battle-stage"
      className={cn(
        'grid min-h-[24rem] overflow-hidden rounded-xl border border-border bg-void',
        'grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)]',
        className,
      )}
    >
      <SideColumn side="friendly" view={view.player} />
      <ContactLine progress={progress} />
      <SideColumn side="enemy" view={view.enemy} />
    </div>
  );
}
