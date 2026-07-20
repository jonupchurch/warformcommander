/**
 * `ZoneColumn` (Feature 5, T013) — one zone's unit stack on one side. Two shapes from one component
 * (FR-005): the **Air row** (`zone === 'Air'`) is a horizontal, wrapping strip with a vertical AIR
 * label; a **ground zone** (Front/Middle/Rear) is a vertical column of {@link UnitSprite}s over a
 * bottom label bar, stacked toward the contact line. Empty zones show an em-dash, never a gap.
 *
 * Pure render of a `UnitView[]` — no state, no loop, no engine. Zone accents are the Feature 3
 * `--zone-*` tokens (Air purple / Front cyan / Middle orange / Rear ink); no raw hex.
 */

import type { WireEvent } from '@/sim/replay-reader';
import type { UnitView } from '@/sim/replay-view';
import { cn } from '@/lib/utils';
import { UnitSprite } from './unit-sprite';

export type ZoneName = 'Air' | 'Front' | 'Middle' | 'Rear';

/** Per-zone accent (label text + soft border/tint) from the Feature 3 zone token ramp. */
const ZONE_ACCENT: Record<ZoneName, string> = {
  Air: 'text-zone-air border-zone-air/25',
  Front: 'text-zone-front border-zone-front/20',
  Middle: 'text-zone-middle border-zone-middle/20',
  Rear: 'text-zone-rear border-zone-rear/25',
};

export interface ZoneColumnProps {
  zone: ZoneName;
  units: UnitView[];
  side: 'friendly' | 'enemy';
  isEmpty: boolean;
  /** the current tick's events → forwarded to each sprite for motion-safe VFX (T037). */
  events?: WireEvent[];
  className?: string;
}

function EmptyDash() {
  // Decorative empty-zone marker — the absence of sprites conveys "empty" to AT; kept out of the a11y
  // tree so its intentionally-faint tint never trips the contrast audit (T038/SC-008).
  return (
    <span aria-hidden className="type-readout self-center text-[0.625rem] text-text-faint">
      —
    </span>
  );
}

function ZoneLabel({ zone, className }: { zone: ZoneName; className?: string }) {
  return (
    <span className={cn('type-eyebrow text-[0.5rem]', ZONE_ACCENT[zone].split(' ')[0], className)}>
      {zone.toUpperCase()}
    </span>
  );
}

export function ZoneColumn({ zone, units, side, isEmpty, events, className }: ZoneColumnProps) {
  if (zone === 'Air') {
    // Horizontal strip; the vertical AIR label sits outboard (left for the player, right for the enemy).
    const label = (
      <span
        className={cn('type-eyebrow text-[0.5rem] [writing-mode:vertical-rl]', ZONE_ACCENT.Air.split(' ')[0])}
      >
        AIR
      </span>
    );
    return (
      <div
        data-slot="zone-air"
        className={cn(
          'flex min-h-14 items-center gap-2.5 rounded-lg border bg-surface-sunken/60 p-2',
          ZONE_ACCENT.Air.split(' ')[1],
          className,
        )}
      >
        {side === 'friendly' && label}
        <div
          className={cn(
            'flex flex-1 flex-wrap items-end gap-2.5',
            side === 'friendly' ? 'justify-end' : 'justify-start',
          )}
        >
          {isEmpty ? (
            <EmptyDash />
          ) : (
            units.map((u) => <UnitSprite key={u.instanceId} unit={u} events={events} />)
          )}
        </div>
        {side === 'enemy' && label}
      </div>
    );
  }

  // Ground zone: a bordered column, units stacked toward the label bar, label bar at the bottom.
  return (
    <div
      data-slot="zone-column"
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-sunken/60',
        className,
      )}
    >
      <div className="flex flex-1 flex-col items-center justify-end gap-2 p-2.5">
        {isEmpty ? (
          <EmptyDash />
        ) : (
          units.map((u) => <UnitSprite key={u.instanceId} unit={u} events={events} />)
        )}
      </div>
      <div className={cn('border-t bg-surface-rail/60 px-1.5 py-1.5 text-center', ZONE_ACCENT[zone].split(' ')[1])}>
        <ZoneLabel zone={zone} />
      </div>
    </div>
  );
}
