/**
 * Battle Playback route (Feature 5, T016) — a Server Component that fetches + gates the stored Replay
 * and hands a typed {@link WireReplay} to the client {@link BattlePlayer}. The reader gates
 * `formatVersion` inside the player; an unsupported/missing replay falls to `error.tsx` or the
 * in-component reject state (FR-003/SC-007).
 *
 * NOTE — replay source: a real persisted replay (Feature 7 `getReplay`, scoped to the viewer via
 * `loadRealReplay`) is the source now that Feature 8 records matches. A non-real id (the `e2e-*` demo
 * links) falls back to the committed **native-emitted battery** replay so the demo surface stays
 * exercisable. The reader gates `formatVersion` inside the player.
 */

import { BattlePlayer } from '@/components/battle/battle-player';
import { AuthError } from '@/server/authz';
import { loadRealReplay } from '@/server/match-read';
import { requireSession } from '@/server/session';
import { deriveUnitDamageTypes } from '@/sim/replay-damage-types';
import type { Side, WireReplay } from '@/sim/replay-reader';
import { loadDefaultRuleset } from '@/sim/validate';
// Imported (not fs-read) so Next traces it into the function bundle — prod-safe. The reader validates
// the shape at runtime, so the JSON's inferred type is cast opaquely.
import battery from '@/tests/fixtures/replay-battery.json';

export const dynamic = 'force-dynamic';

function demoReplay(): { replay: WireReplay; playerSide: Side } {
  return { replay: battery as unknown as WireReplay, playerSide: 'A' };
}

export default async function BattlePage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;

  let viewerId: string | undefined;
  try {
    viewerId = (await requireSession()).id;
  } catch (e) {
    if (!(e instanceof AuthError)) throw e; // anonymous → demo fallback below
  }

  const { replay, playerSide } = (await loadRealReplay(matchId, viewerId)) ?? demoReplay();

  // Each unit's damage type (Kinetic/Energy/Explosive) for the combat VFX — derived once, server-side,
  // from the replay's persisted armies (a weapon's family is fixed for the whole match), so the client
  // player reads it as data and stays a pure seek-only renderer (P6).
  const damageTypes = deriveUnitDamageTypes(
    replay.meta.unitOrder,
    replay.meta.armies,
    loadDefaultRuleset(),
  );

  // Skip-to-Outcome closes the loop to the Feature 6 summary for this match.
  return (
    <BattlePlayer
      replay={replay}
      playerSide={playerSide}
      damageTypes={damageTypes}
      summaryHref={`/matches/${matchId}/summary`}
    />
  );
}
