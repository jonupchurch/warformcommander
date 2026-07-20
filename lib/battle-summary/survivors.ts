/**
 * `perGameSurvivors` (Feature 6) — per-game survivor counts split by viewer/opponent, read from each
 * game's final snapshot (`row[3]` = alive). Pure over the emitted stream; shared by the demo seam and
 * Feature 8's real match read so both derive the per-game cards identically.
 */

import type { Side } from '@/sim/model';
import type { WireReplay } from '@/sim/replay-reader';

export function perGameSurvivors(
  replay: WireReplay,
  viewerSide: Side,
): { viewer: number; opponent: number }[] {
  return replay.games.map((game) => {
    const last = game.snapshots[game.snapshots.length - 1] ?? [];
    let viewer = 0;
    let opponent = 0;
    last.forEach((row, column) => {
      if (row[3] !== 0) {
        if (replay.meta.unitOrder[column]?.side === viewerSide) viewer += 1;
        else opponent += 1;
      }
    });
    return { viewer, opponent };
  });
}
