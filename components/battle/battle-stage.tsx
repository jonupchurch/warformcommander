/**
 * `BattleStage` (Feature 5, T014/T036) — the whole two-side, 4-zone battlefield for one tick. **Pure
 * render** of a {@link BattleViewModel}: no state, no loop, no engine (this is the swappable render
 * seam — a Canvas backend could replace it behind the same `(view, progress)` props without touching
 * seek/loop logic; not built — YAGNI).
 *
 * Layout (FR-005, §4/mockup): each side is an Air row over three ground zones ordered **toward the
 * contact line** (player `Rear→Middle→Front`, enemy `Front→Middle→Rear`, already ordered by
 * `sim/replay-view.ts`). **Orientation-responsive (P7)**: portrait **stacks** the two sides with a
 * horizontal contact strip between them; landscape is the wide two-column grid with a vertical contact
 * line. One markup; `minmax(0,1fr)` columns shrink rather than overflow (SC-004). Token-only.
 *
 * The current tick's `events` are threaded to each {@link UnitSprite} for motion-safe VFX (T037).
 */

import type { WireEvent } from '@/sim/replay-reader';
import type { BattleViewModel, SideView } from '@/sim/replay-view';
import { cn } from '@/lib/utils';
import { ContactLine } from './contact-line';
import { ZoneColumn } from './zone-column';

export interface BattleStageProps {
  view: BattleViewModel;
  /** currentTick / lastTick → the contact-line node position. */
  progress: number;
  /** the current tick's events → per-unit motion-safe VFX (T037). */
  events?: WireEvent[];
  className?: string;
}

function SideColumn({
  side,
  view,
  events,
}: {
  side: 'friendly' | 'enemy';
  view: SideView;
  events?: WireEvent[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 p-2 sm:p-3">
      <ZoneColumn zone="Air" side={side} units={view.air} isEmpty={view.airEmpty} events={events} />
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2">
        {view.ground.map((z) => (
          <ZoneColumn key={z.zone} zone={z.zone} side={side} units={z.units} isEmpty={z.isEmpty} events={events} />
        ))}
      </div>
    </div>
  );
}

export function BattleStage({ view, progress, events, className }: BattleStageProps) {
  return (
    <div
      data-slot="battle-stage"
      className={cn(
        'flex min-h-96 flex-col overflow-hidden rounded-xl border border-border bg-void',
        'lg:grid lg:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)]',
        className,
      )}
    >
      <SideColumn side="friendly" view={view.player} events={events} />
      <ContactLine progress={progress} />
      <SideColumn side="enemy" view={view.enemy} events={events} />
    </div>
  );
}
