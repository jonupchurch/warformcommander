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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BattlePlayer } from '@/components/battle/battle-player';
import type { Side, WireReplay } from '@/sim/replay-reader';

// Request-time only: the demo source reads a committed file, so never pre-render this route.
export const dynamic = 'force-dynamic';

function loadReplay(): { replay: WireReplay; playerSide: Side } {
  const path = join(process.cwd(), 'tests', 'fixtures', 'replay-battery.json');
  const replay = JSON.parse(readFileSync(path, 'utf8')) as WireReplay;
  return { replay, playerSide: 'A' };
}

export default async function BattlePage({ params }: { params: Promise<{ matchId: string }> }) {
  await params; // resolves the async route params; matchId keys F7's getReplay once it lands.
  const { replay, playerSide } = loadReplay();

  return <BattlePlayer replay={replay} playerSide={playerSide} />;
}
