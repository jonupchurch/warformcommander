/**
 * Per-machine damage reduction (Feature 6, T006) — the optional MVP input. A **single O(events) pass**
 * over the replay's tick events (research D3): sum each machine's damage dealt (as attacker), damage
 * absorbed (as defender), and kills (as the killer on a death). **No re-simulation** — this reads the
 * already-emitted event stream. Pure.
 *
 * Per Feature 1's guarantee, Σ `damageDealt` over a side reconciles with `MatchResult.side*.damageDealt`
 * (SC-002). Returns `undefined` when no events are present, so the caller simply omits the MVP (FR-010).
 */

import type { Side } from '@/sim/model';
import type { WireGame, WireUnit } from '@/sim/replay-reader';

/** One machine's aggregate combat contribution across the match (damage in milli-units). */
export interface PerMachineDamage {
  /** index into `unitOrder` — the machine's column in every snapshot/event. */
  column: number;
  side: Side;
  damageDealt: number;
  damageAbsorbed: number;
  kills: number;
}

/**
 * Reduce the per-tick events of every game into one {@link PerMachineDamage} per machine (aligned to
 * `unitOrder`). Events reference machines by column index (`a`/`d` on a hit, `k` on a death).
 */
export function perMachineDamageFromEvents(
  games: readonly WireGame[] | undefined,
  unitOrder: readonly WireUnit[],
): PerMachineDamage[] | undefined {
  if (!games || games.length === 0) return undefined;

  const acc: PerMachineDamage[] = unitOrder.map((u, column) => ({
    column,
    side: u.side,
    damageDealt: 0,
    damageAbsorbed: 0,
    kills: 0,
  }));

  let sawEvent = false;
  for (const game of games) {
    for (const tickEvents of game.events ?? []) {
      for (const event of tickEvents) {
        sawEvent = true;
        if (event.t === 'hit') {
          if (acc[event.a]) acc[event.a]!.damageDealt += event.dmg;
          if (acc[event.d]) acc[event.d]!.damageAbsorbed += event.dmg;
        } else if (event.t === 'death' && event.k != null) {
          if (acc[event.k]) acc[event.k]!.kills += 1;
        }
      }
    }
  }

  return sawEvent ? acc : undefined;
}
