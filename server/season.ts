/**
 * Weekly-season math for the automated bot ladder (cold-start liveness). Kept in its own module —
 * **no DB or wasm imports** — so the boundary logic (the subtle, off-by-one-prone part) is unit-testable
 * in isolation. The ladder resets every Monday 00:00 UTC; the boundary is derived from the calendar so
 * no schema/season table is needed, and a rollover is detected by comparing the most-recent ranked
 * match's season to "now".
 */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 2024-01-01 00:00 UTC is a Monday — anchoring here makes every season boundary land on a Monday. */
export const SEASON_ANCHOR = Date.UTC(2024, 0, 1);

/** Monotonic weekly season index for an instant (increments each Monday 00:00 UTC). */
export function seasonIdFor(ms: number): number {
  return Math.floor((ms - SEASON_ANCHOR) / WEEK_MS);
}

/** The Monday 00:00 UTC instant a season begins. */
export function seasonStartMs(seasonId: number): number {
  return SEASON_ANCHOR + seasonId * WEEK_MS;
}

/**
 * True iff `nowMs` falls in a later weekly season than the most-recent ranked match — i.e. the ladder
 * has rolled into a new week and should be reset once. `null` (no ranked match yet) is never a reset:
 * the first run of all time just populates the current season.
 */
export function isNewSeason(lastRankedMs: number | null, nowMs: number): boolean {
  return lastRankedMs !== null && seasonIdFor(lastRankedMs) < seasonIdFor(nowMs);
}
