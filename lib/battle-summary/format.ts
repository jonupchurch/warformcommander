/**
 * Battle Summary format helpers (Feature 6, T004) — pure, no I/O. Duration → seconds, milli-units →
 * whole damage, and the units-killed / units-lost / avg-hull derivations off survivor counts + fates.
 * Kept separate from `view-model.ts` so the arithmetic is unit-testable in isolation (SC-003).
 */

import type { MachineFate, Side } from '@/sim/model';

/** A standard army is five machines (design §16). */
export const ARMY_SIZE = 5;

/** `290, 10` → `"29.0s"`. Guards a zero/absent tick rate to the 10 t/s default (§9). */
export function ticksToSeconds(ticks: number, tickRate: number): string {
  const rate = tickRate > 0 ? tickRate : 10;
  return `${(ticks / rate).toFixed(1)}s`;
}

/** Milli-units → whole (rounded), for display damage. */
export function milliToWhole(milli: number): number {
  return Math.round(milli / 1000);
}

/** Units a side killed = the enemy's losses = `ARMY_SIZE − enemySurvivors` (never negative). */
export function unitsKilled(enemySurvivors: number): number {
  return Math.max(0, ARMY_SIZE - enemySurvivors);
}

/** Units a side lost = `ARMY_SIZE − ownSurvivors` (never negative). */
export function unitsLost(ownSurvivors: number): number {
  return Math.max(0, ARMY_SIZE - ownSurvivors);
}

/**
 * A side's average hull left (%), over its machines' final fates — destroyed machines count as 0,
 * survivors contribute their `survivedWithHullPct` (basis points → %). `0` on a total wipe, and `0`
 * when the side has no machines (no divide-by-zero).
 */
export function avgHullLeftPct(fates: MachineFate[], side: Side): number {
  const mine = fates.filter((f) => f.unit.side === side);
  if (mine.length === 0) return 0;
  const sumBp = mine.reduce(
    (sum, f) => sum + ('survivedWithHullPct' in f.fate ? f.fate.survivedWithHullPct : 0),
    0,
  );
  return Math.round(sumBp / mine.length / 100); // bp → %
}
