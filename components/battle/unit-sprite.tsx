/**
 * `UnitSprite` (Feature 5, T012) — one {@link UnitView} rendered at its current-tick snapshot state:
 * the Feature 3 {@link UnitIcon} (faction-tinted via `currentColor`) over token-styled hull/shield
 * bars + a numeric readout, with the **dead treatment** (dimmed + "DOWN") applied straight from the
 * snapshot's `alive` flag. Pure render — no state, no loop, no engine.
 *
 * This is the **render leaf that owns the `typeId → UnitIcon` mapping** (the layering note in
 * `sim/replay-view.ts`): `sim/` stays UI-free and carries the raw `typeId`; the icon key lives here.
 * Event-driven VFX (fire/hit/death) are stubbed for US5 (T037) — the state is always readable from
 * the snapshot alone (FR-006/FR-020), so reduced-motion loses nothing.
 */

import type { UnitView } from '@/sim/replay-view';
import type { WireEvent } from '@/sim/replay-reader';
import { UnitIcon, type MachineTypeKey } from '@/components/brand/unit-icon';
import { cn } from '@/lib/utils';

/** The seven engine `MachineTypeId`s → the Feature 3 `UnitIcon` keys (the only UI-facing map). */
const ICON_KEY: Record<string, MachineTypeKey> = {
  HeavyTank: 'heavytank',
  LightTank: 'lighttank',
  Mech: 'mech',
  AttackHeli: 'heli',
  RocketArtillery: 'rocketarty',
  Artillery: 'artillery',
  RearSupport: 'support',
};

/** Faction-scoped classes for the icon frame + hull-bar fill (token-only; no raw hex). */
const FRAME = {
  friendly: 'border-faction-friendly/35 bg-faction-friendly-soft text-faction-friendly',
  enemy: 'border-faction-enemy/40 bg-faction-enemy-soft text-faction-enemy',
} as const;

const HULL_FILL = {
  friendly: 'bg-faction-friendly',
  enemy: 'bg-faction-enemy',
} as const;

export interface UnitSpriteProps {
  unit: UnitView;
  /** this unit's events at the current tick → motion-safe VFX (wired in US5/T037; unread for now). */
  events?: WireEvent[];
  className?: string;
}

// `events` stays in the props contract (US5/T037 VFX) but is intentionally unread in US1.

function Bar({ pct, fill }: { pct: number; fill: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-track">
      <div className={cn('h-full rounded-full', fill)} style={{ width: `${Math.round(pct * 100)}%` }} />
    </div>
  );
}

export function UnitSprite({ unit, events, className }: UnitSpriteProps) {
  const iconKey = ICON_KEY[unit.typeId] ?? 'heavytank';
  const label = `${unit.typeId} ${unit.variantId}`;

  // Event-driven VFX (T037): a flash on the tick this unit is hit or destroyed. Gated behind
  // `motion-safe:` and hidden under reduced motion — the unit's state is always readable from the
  // snapshot alone (hull bars + "DOWN"), so nothing is lost when the flash is suppressed (FR-020).
  const died = events?.some((e) => e.t === 'death' && e.u === unit.column) ?? false;
  const hit = events?.some((e) => e.t === 'hit' && e.d === unit.column) ?? false;
  const flash = died ? 'bg-faction-enemy/40' : hit ? 'bg-faction-friendly/30' : null;

  return (
    <div
      data-slot="unit-sprite"
      data-instance={unit.instanceId}
      data-alive={unit.alive}
      className={cn(
        'flex w-full max-w-17 flex-col items-center gap-1',
        // Dead units dim but stay legible — the "DOWN" tell reads without motion (FR-006).
        !unit.alive && 'opacity-45 grayscale',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex aspect-64/40 w-full items-center justify-center rounded-md border p-0.5',
          FRAME[unit.faction],
        )}
      >
        <UnitIcon type={iconKey} title={label} className="h-full w-full" />
        {flash && (
          <span
            aria-hidden
            className={cn('pointer-events-none absolute inset-0 rounded-md motion-reduce:hidden motion-safe:animate-ping', flash)}
          />
        )}
      </div>

      <Bar pct={unit.hullPct} fill={HULL_FILL[unit.faction]} />
      {unit.hasShield && <Bar pct={unit.shieldPct} fill="bg-text-muted" />}

      <span className="type-readout text-[0.5rem] leading-none text-text-muted">
        {unit.alive ? Math.round(unit.hull).toLocaleString() : 'DOWN'}
      </span>
    </div>
  );
}
