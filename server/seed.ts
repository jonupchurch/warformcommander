/**
 * The match seed (Feature 8, T007) — a fresh, cryptographically-strong integer minted **server-side**,
 * one per match (P6/FR-010). The client never supplies, previews, or derives it, so it cannot steer
 * the engine RNG.
 *
 * The engine host (`sim/index.ts` `BattleInput.seed`) takes a JS `number` (≤ 2^53), and the engine
 * echoes it into `replay.meta.seed`, which `recordMatch` persists to the `numeric(20,0)` column and
 * from which a match is exactly reproduced (SC-007). So the seed is a JS-safe integer in `[0, 2^53)`
 * — 53 bits of crypto entropy is ample for match uniqueness, and it round-trips losslessly.
 */

import { randomBytes } from 'node:crypto';

/** A fresh crypto-strong seed in `[0, 2^53)` — accepts no arguments (nothing for a client to override). */
export function serverSeed(): number {
  // 7 crypto bytes = 56 bits; mask to 53 so the value is an exact JS integer.
  const bytes = randomBytes(7);
  let value = 0;
  for (const byte of bytes) value = value * 256 + byte;
  return value % Number.MAX_SAFE_INTEGER; // [0, 2^53−1)
}
