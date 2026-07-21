/**
 * Client roster-slot helpers (Feature 4/7). The baseline roster holds {@link ROSTER_CAP} squads in
 * fixed slots `0..ROSTER_CAP-1` (mirrors the server `BASELINE_SLOTS`); the Garage fills the lowest
 * free slot when fielding a fresh build or duplicating an existing squad. Kept in one place so the
 * rail and the board agree on the cap.
 */

/** Baseline roster capacity — squads occupy fixed slots `0..ROSTER_CAP-1` (server `BASELINE_SLOTS`). */
export const ROSTER_CAP = 8;

/** The lowest roster slot (`0..ROSTER_CAP-1`) not already occupied, or `null` if the roster is full. */
export function firstFreeRosterSlot(taken: Set<number>): number | null {
  for (let i = 0; i < ROSTER_CAP; i += 1) if (!taken.has(i)) return i;
  return null;
}
