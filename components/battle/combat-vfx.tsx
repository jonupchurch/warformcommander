/**
 * Combat VFX (Battle Playback) — the **muzzle flash** a unit shows on the tick it fires and the
 * **impact/explosion** it shows on the tick it's hit, both keyed to the attacker's damage family
 * (Kinetic / Energy / Explosive). The purpose-built `public/icons/{muzzle,explosion}-*.svg` are
 * inlined here (they draw in `currentColor`) so the family token both **tints** them and their
 * distinct **shapes** read the type — colour + silhouette, so it survives colour-blindness.
 *
 * Placement (caller-driven): the explosion sits on a unit's **outboard** edge and the muzzle on its
 * **inboard** edge (toward the contact line = its firing arc). Enemy VFX are **mirrored on X** so the
 * directional muzzle points the right way. Motion-safe: it pings under motion and sits static (still
 * visible — no information lost) under reduced motion, matching the snapshot-readable rule (FR-020).
 *
 * Support/heal has its own pair ({@link SupportVfx}): a directional **heal-emit** on the healer's
 * inboard edge (mirrored on the defending side, like the muzzle) and **heal-receive** waves across the
 * mended unit — so the medic is visibly working (the heal is real; only the VFX was missing).
 */

import type { WireEvent } from '@/sim/replay-reader';
import type { DamageType } from '@/sim/ruleset';
import { cn } from '@/lib/utils';

/** Inner SVG markup (viewBox `0 0 48 48`) per damage family — the star/ring/blast impact silhouettes. */
const IMPACT_MARKUP: Record<DamageType, string> = {
  Kinetic:
    '<polygon points="24,4 28,18 42,10 30,22 46,24 30,26 42,38 28,30 24,44 20,30 6,38 18,26 2,24 18,22 6,10 20,18" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><circle cx="24" cy="24" r="4" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/>',
  Energy:
    '<circle cx="24" cy="24" r="6" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><circle cx="24" cy="24" r="13" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 5"/><line x1="24" y1="2" x2="24" y2="9" stroke="currentColor" stroke-width="2.4"/><line x1="24" y1="39" x2="24" y2="46" stroke="currentColor" stroke-width="2.4"/><line x1="2" y1="24" x2="9" y2="24" stroke="currentColor" stroke-width="2.4"/><line x1="39" y1="24" x2="46" y2="24" stroke="currentColor" stroke-width="2.4"/>',
  Explosive:
    '<path d="M24 9 l4.5 4 5.5 -1.5 -1 5.5 5 3 -4 4 2 5.5 -5.5 -0.5 -1.5 5.5 -5 -2.5 -5 2.5 -1.5 -5.5 -5.5 0.5 2 -5.5 -4 -4 5 -3 -1 -5.5 5.5 1.5 z" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><line x1="24" y1="2" x2="24" y2="7" stroke="currentColor" stroke-width="2.4"/><line x1="24" y1="41" x2="24" y2="46" stroke="currentColor" stroke-width="2.4"/><line x1="2" y1="24" x2="7" y2="24" stroke="currentColor" stroke-width="2.4"/><line x1="41" y1="24" x2="46" y2="24" stroke="currentColor" stroke-width="2.4"/>',
};

/** Inner SVG markup (viewBox `0 0 64 40`) per damage family — the barrel-left, blast-right muzzle. */
const MUZZLE_MARKUP: Record<DamageType, string> = {
  Kinetic:
    '<line x1="6" y1="20" x2="20" y2="20" stroke="currentColor" stroke-width="4"/><polygon points="20,20 58,8 44,20 58,32" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><line x1="20" y1="20" x2="52" y2="20" stroke="currentColor" stroke-width="2.4"/><line x1="24" y1="14" x2="38" y2="10" stroke="currentColor" stroke-width="2.4"/><line x1="24" y1="26" x2="38" y2="30" stroke="currentColor" stroke-width="2.4"/>',
  Energy:
    '<line x1="6" y1="20" x2="18" y2="20" stroke="currentColor" stroke-width="4"/><circle cx="24" cy="20" r="6" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><path d="M34 10 L44 20 L34 30" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M44 12 L52 20 L44 28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M54 14 L60 20 L54 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  Explosive:
    '<line x1="6" y1="20" x2="18" y2="20" stroke="currentColor" stroke-width="4"/><path d="M18 20 C24 8, 40 6, 50 12 C44 16, 46 20, 50 24 C46 28, 44 32, 50 34 C40 34, 24 32, 18 20 Z" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><circle cx="56" cy="12" r="2" fill="currentColor"/><circle cx="60" cy="22" r="2" fill="currentColor"/><circle cx="55" cy="30" r="2" fill="currentColor"/>',
};

/** Damage family → its text-colour token (drives the SVG `currentColor`). */
const FAMILY_COLOR: Record<DamageType, string> = {
  Kinetic: 'text-family-kinetic',
  Energy: 'text-family-energy',
  Explosive: 'text-family-explosive',
};

/** Support/heal VFX markup (`public/icons/heal-{emit,receive}.svg`, inlined for `currentColor`). */
// Emitter (viewBox `0 0 48 48`): waves radiating rightward from a source — directional, so it mirrors
// on X for the defending side (same rule as the muzzle) to point at the ally it's mending.
const HEAL_EMIT_MARKUP =
  '<circle cx="12" cy="24" r="3" fill="currentColor"/><path d="M20 15 A12 12 0 0 1 20 33" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M28 10 A19 19 0 0 1 28 38" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M36 6 A25 25 0 0 1 36 42" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>';
// Receiver (viewBox `0 0 64 40`): three restorative waves across the mended unit — non-directional.
const HEAL_RECEIVE_MARKUP =
  '<path d="M6 12 q7 -7 14 0 t14 0 t14 0 t10 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M6 20 q7 -7 14 0 t14 0 t14 0 t10 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M6 28 q7 -7 14 0 t14 0 t14 0 t10 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>';

export type VfxKind = 'muzzle' | 'impact';

/** The VFX a single unit shows at one tick — a pure projection of the tick's events for that column. */
export interface CombatVfxState {
  /** This unit fired this tick (→ a muzzle flash on its inboard edge). */
  fired: boolean;
  /** Its own weapon damage type (`null` = unresolved → an untyped muzzle). */
  muzzleType: DamageType | null;
  /** This unit was hit this tick (→ an explosion on its outboard edge). */
  impacted: boolean;
  /** The (last) attacker's damage type — what struck this unit (`null` = unresolved → untyped). */
  impactType: DamageType | null;
  /** This unit was destroyed this tick. */
  died: boolean;
  /** This unit emitted support this tick (it's a healer → a directional heal-emit on its inboard edge). */
  healing: boolean;
  /** This unit received support this tick (→ restorative waves across it). */
  healed: boolean;
}

/**
 * Pure selector: what VFX unit `column` shows at this tick, from the tick's `events` + the static
 * per-column `damageTypes`. A unit can both fire and be hit in one tick (distinct edges, no overlap).
 *
 * **Firing** is keyed to being the attacker (`a`) of a `hit` or `miss` — the wire stream carries no
 * standalone `shot` event, so every shot taken shows up as its resolution (a landed hit or a whiff).
 * One shot can splash into several `hit`s, but `fired` is a boolean → one muzzle flash regardless.
 * **Being hit** is the defender (`d`) of a `hit`; when several attackers strike it in one tick the
 * **last** hit's family is shown (deterministic; one clean burst). Pure + exported so the rules are
 * unit-tested without rendering.
 */
export function pickCombatVfx(
  events: readonly WireEvent[] | undefined,
  column: number,
  damageTypes: readonly (DamageType | null)[] | undefined,
): CombatVfxState {
  const typeAt = (col: number): DamageType | null => damageTypes?.[col] ?? null;
  let fired = false;
  let impacted = false;
  let died = false;
  let healing = false;
  let healed = false;
  let impactType: DamageType | null = null;

  for (const e of events ?? []) {
    if (e.t === 'hit') {
      if (e.a === column) fired = true;
      if (e.d === column) {
        impacted = true;
        impactType = typeAt(e.a); // last hit wins
      }
    } else if (e.t === 'miss') {
      if (e.a === column) fired = true; // a whiff is still a shot taken → muzzle flash
    } else if (e.t === 'death') {
      if (e.u === column) died = true;
    } else if (e.t === 'support') {
      if (e.a === column) healing = true; // the healer emits
      if (e.d === column) healed = true; // the mended unit receives
    }
  }

  return { fired, muzzleType: fired ? typeAt(column) : null, impacted, impactType, died, healing, healed };
}

/** One VFX overlay (muzzle or impact) for a damage family, anchored to an edge and optionally mirrored. */
export function CombatVfx({
  kind,
  type,
  side,
  mirrored,
}: {
  kind: VfxKind;
  type: DamageType;
  /** Which sprite edge to straddle. */
  side: 'left' | 'right';
  /** Enemy units flip on X so the directional muzzle points toward the contact line. */
  mirrored: boolean;
}) {
  const markup = kind === 'impact' ? IMPACT_MARKUP[type] : MUZZLE_MARKUP[type];
  const viewBox = kind === 'impact' ? '0 0 48 48' : '0 0 64 40';
  const size = kind === 'impact' ? 'h-5 w-5' : 'h-4 w-6';
  return (
    // Outer: static edge-anchor (its own transform) so the ping's scale never drops the position.
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-1/2 z-10 -translate-y-1/2',
        side === 'left' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2',
        FAMILY_COLOR[type],
      )}
    >
      {/* Middle: the burst animation (its own transform). Static + visible under reduced motion. */}
      <span className="block motion-safe:animate-ping">
        <svg
          viewBox={viewBox}
          fill="none"
          className={cn(size, mirrored && '-scale-x-100')}
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      </span>
    </span>
  );
}

/**
 * Support/heal overlay. `emit` is the healer's directional heal-wave on its inboard edge (mirrored on
 * the defending side so it points at the ally, same rule as the muzzle); `receive` is the restorative
 * waves across a mended unit. Faction-neutral support tint; motion-safe (a still, legible frame under
 * reduced motion so the heal never depends on animation).
 */
export function SupportVfx({
  kind,
  side,
  mirrored,
}: {
  kind: 'emit' | 'receive';
  /** `emit` only — which edge to straddle (the healer's inboard edge). */
  side?: 'left' | 'right';
  /** `emit` only — flip on X on the defending side so the waves point at the ally. */
  mirrored?: boolean;
}) {
  if (kind === 'receive') {
    return (
      <span aria-hidden className="pointer-events-none absolute inset-0 z-10 text-family-support">
        <span className="block h-full w-full motion-safe:animate-ping">
          <svg
            viewBox="0 0 64 40"
            fill="none"
            className="h-full w-full"
            dangerouslySetInnerHTML={{ __html: HEAL_RECEIVE_MARKUP }}
          />
        </span>
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 text-family-support',
        side === 'left' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2',
      )}
    >
      <span className="block motion-safe:animate-ping">
        <svg
          viewBox="0 0 48 48"
          fill="none"
          className={cn('h-5 w-5', mirrored && '-scale-x-100')}
          dangerouslySetInnerHTML={{ __html: HEAL_EMIT_MARKUP }}
        />
      </span>
    </span>
  );
}
