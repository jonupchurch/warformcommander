/**
 * `UnitSprite` (Feature 5, T012) — one {@link UnitView} rendered at its current-tick snapshot state:
 * the Feature 3 {@link UnitIcon} (faction-tinted via `currentColor`) over token-styled hull/shield
 * bars + a numeric readout, with the **dead treatment** (dimmed + "DOWN") applied straight from the
 * snapshot's `alive` flag. Pure render — no state, no loop, no engine.
 *
 * This is the **render leaf that owns the `typeId → UnitIcon` mapping** (the layering note in
 * `sim/replay-view.ts`): `sim/` stays UI-free and carries the raw `typeId`; the icon key lives here.
 * Event-driven VFX (T037): a **muzzle flash** on the tick this unit fires (its inboard edge, toward
 * the contact line) and a **damage-typed explosion** on the tick it's hit (its outboard edge, keyed
 * to the attacker's family) — plus the death burst. All motion-safe; the state is always readable
 * from the snapshot alone (FR-006/FR-020), so reduced-motion loses nothing.
 */

import type { UnitView } from '@/sim/replay-view';
import type { WireEvent } from '@/sim/replay-reader';
import type { DamageType } from '@/sim/ruleset';
import { ICON_FACES_RIGHT, UnitIcon, type MachineTypeKey } from '@/components/brand/unit-icon';
import { cn } from '@/lib/utils';
import { CombatVfx, SupportVfx, pickCombatVfx } from './combat-vfx';

/** The seven engine `MachineTypeId`s → the Feature 3 `UnitIcon` keys (the only UI-facing map). */
const ICON_KEY: Record<string, MachineTypeKey> = {
  HeavyTank: 'heavytank',
  LightTank: 'lighttank',
  Mech: 'mech',
  AttackHeli: 'heli',
  RocketArtillery: 'rocketarty',
  Artillery: 'artillery',
  RearSupport: 'support',
  Commander: 'support', // US5 — promoted support chassis, shares the support silhouette
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
  /** this unit's tick events → motion-safe fire/hit/death VFX (T037). */
  events?: WireEvent[];
  /** per-column damage type (aligned to `meta.unitOrder`) → the muzzle/impact VFX family. */
  damageTypes?: (DamageType | null)[];
  className?: string;
}

function Bar({ pct, fill }: { pct: number; fill: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-track">
      <div className={cn('h-full rounded-full', fill)} style={{ width: `${Math.round(pct * 100)}%` }} />
    </div>
  );
}

/** An untyped fallback burst on one edge (used only when a unit's damage type can't be resolved). */
function EdgeFlash({ side, tone }: { side: 'left' | 'right'; tone: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-1/2 z-10 h-4 w-4 -translate-y-1/2 rounded-full motion-reduce:hidden motion-safe:animate-ping',
        side === 'left' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2',
        tone,
      )}
    />
  );
}

export function UnitSprite({ unit, events, damageTypes, className }: UnitSpriteProps) {
  const iconKey = ICON_KEY[unit.typeId] ?? 'heavytank';
  const label = `${unit.typeId} ${unit.variantId}`;

  // Event-driven VFX (T037): muzzle on fire, explosion on hit, a burst on death. All gated behind
  // `motion-safe:` — the unit's state is always readable from the snapshot alone (hull bars + "DOWN"),
  // so nothing is lost under reduced motion (FR-020). Friendly units face right (fire toward the
  // contact line on their right, take hits on their left/outboard); enemy units are the mirror.
  const vfx = pickCombatVfx(events, unit.column, damageTypes);
  const muzzleSide = unit.faction === 'friendly' ? 'right' : 'left';
  const impactSide = unit.faction === 'friendly' ? 'left' : 'right';
  const mirrored = unit.faction === 'enemy';

  // Face the enemy: friendly points right, enemy points left. Flip the art only when its default
  // facing disagrees with the side it's on — so the heli (drawn nose-left) flips for friendlies and
  // every right-facing machine (tanks/mech/artillery/rockets) flips for enemies. Symmetric icons
  // (support) flip to a no-op. The VFX layers key off `muzzleSide`/`impactSide`, not this.
  const wantsRight = unit.faction === 'friendly';
  const flipIcon = ICON_FACES_RIGHT[iconKey] !== wantsRight;

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
        <UnitIcon type={iconKey} title={label} className={cn('h-full w-full', flipIcon && '-scale-x-100')} />

        {/* Death: a full-cover burst marking the kill (the DOWN + grayscale carry it without motion). */}
        {vfx.died && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-md bg-faction-enemy/40 motion-reduce:hidden motion-safe:animate-ping"
          />
        )}

        {/* Impact: the attacker's damage-typed explosion on this unit's outboard edge. */}
        {vfx.impacted &&
          (vfx.impactType ? (
            <CombatVfx kind="impact" type={vfx.impactType} side={impactSide} mirrored={mirrored} />
          ) : (
            <EdgeFlash side={impactSide} tone="bg-text-strong/25" />
          ))}

        {/* Muzzle: this unit's damage-typed flash on its inboard edge (its firing arc). */}
        {vfx.fired &&
          (vfx.muzzleType ? (
            <CombatVfx kind="muzzle" type={vfx.muzzleType} side={muzzleSide} mirrored={mirrored} />
          ) : (
            <EdgeFlash side={muzzleSide} tone="bg-text-strong/25" />
          ))}

        {/* Support: the mended unit shows restorative waves; the healer emits on its inboard edge
            (mirrored for the defending side, like the muzzle). Now the medic is visibly working. */}
        {vfx.healed && <SupportVfx kind="receive" />}
        {vfx.healing && <SupportVfx kind="emit" side={muzzleSide} mirrored={mirrored} />}
      </div>

      <Bar pct={unit.hullPct} fill={HULL_FILL[unit.faction]} />
      {unit.hasShield && <Bar pct={unit.shieldPct} fill="bg-text-muted" />}

      <span className="type-readout text-[0.5rem] leading-none text-text-muted">
        {unit.alive ? Math.round(unit.hull).toLocaleString() : 'DOWN'}
      </span>
    </div>
  );
}
