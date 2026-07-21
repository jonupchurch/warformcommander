/**
 * Per-column damage type for a replay's units (Battle Playback VFX). A machine's weapon family is
 * **fixed for the whole match** (the loadout never changes mid-battle), so each unit's damage type
 * (Kinetic / Energy / Explosive) is derived **once** from the persisted `meta.armies` + the ruleset —
 * the player then reads this array as plain data and re-derives nothing per frame, keeping the
 * playback a pure seek-only player (P6, the `sim/replay-view.ts` anti-regression).
 *
 * This is a projection over the replay's static meta, **not** part of the seek view; it uses the same
 * pure `deriveEffectiveStats` the Garage already relies on (no wasm). Returns `null` for any column
 * whose army/machine can't be resolved (a malformed/absent `meta.armies`, or a support unit that
 * never fires) — the VFX layer falls back to an untyped flash there.
 */

import { deriveEffectiveStats } from './derive';
import type { Army } from './model';
import type { WireUnit } from './replay-reader';
import type { DamageType, Ruleset } from './ruleset';

/** Damage type per unit, aligned 1:1 to `meta.unitOrder` columns (`null` when unresolvable). */
export function deriveUnitDamageTypes(
  unitOrder: readonly WireUnit[],
  armies: unknown,
  ruleset: Ruleset,
): (DamageType | null)[] {
  // `meta.armies` is opaque to the reader; here we know it is `[Army /* A */, Army /* B */]`.
  const pair = Array.isArray(armies) ? (armies as [Army?, Army?]) : [];
  return unitOrder.map((u) => {
    const army = u.side === 'A' ? pair[0] : pair[1];
    const machine = army?.machines.find((m) => m.instanceId === u.instanceId);
    if (!machine) return null;
    const derived = deriveEffectiveStats(machine, ruleset);
    return derived.ok ? derived.stats.damageType : null;
  });
}
