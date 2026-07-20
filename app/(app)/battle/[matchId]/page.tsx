/**
 * Battle Playback route (Feature 5, T016) — a Server Component that fetches + gates the stored Replay
 * and hands a typed {@link WireReplay} to the client {@link BattlePlayer}. The reader gates
 * `formatVersion` inside the player; an unsupported/missing replay falls to `error.tsx` or the
 * in-component reject state (FR-003/SC-007).
 *
 * NOTE — replay source: Feature 7's `getReplay(ctx, matchId)` (server-only, ownership-checked) is the
 * real source and lands when F7 merges. Until then this route renders the committed **native-emitted
 * battery** replay so the whole playback surface is exercisable end-to-end. Swap `loadReplay` for the
 * F7 fetch (and derive `playerSide` from the match) when it lands — a single call site.
 */

import { BattlePlayer } from '@/components/battle/battle-player';
import type { Side, WireReplay } from '@/sim/replay-reader';
// Imported (not fs-read) so Next traces it into the function bundle — prod-safe until F7's getReplay
// lands. The reader validates the shape at runtime, so the JSON's inferred type is cast opaquely.
import battery from '@/tests/fixtures/replay-battery.json';

function loadReplay(): { replay: WireReplay; playerSide: Side } {
  return { replay: battery as unknown as WireReplay, playerSide: 'A' };
}

export default async function BattlePage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params; // keys F7's getReplay once it lands; also the summary round-trip.
  const { replay, playerSide } = loadReplay();

  // Skip-to-Outcome closes the loop to the Feature 6 summary for this match.
  return (
    <BattlePlayer replay={replay} playerSide={playerSide} summaryHref={`/matches/${matchId}/summary`} />
  );
}
