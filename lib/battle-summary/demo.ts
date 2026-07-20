/**
 * Demo read-seam (Feature 6) — until Feature 7's ownership-scoped read path lands, the summary route
 * derives its `MatchResult` + context from the committed native **battery** replay (2 games, real
 * deaths/damage). Imported (not fs-read) so Next traces it into the bundle — prod-safe. Swap
 * `loadSummaryContext` for the F7 fetch (match result + replay ref + standing) when it lands; a single
 * call site. Pure/server-safe: no engine, no re-sim — it only reads the emitted stream.
 */

import type { MatchResult, Side } from '@/sim/model';
import type { WireReplay } from '@/sim/replay-reader';
import battery from '@/tests/fixtures/replay-battery.json'; // demo fixture; F7 read replaces this

import { perMachineDamageFromEvents } from './mvp';
import { perGameSurvivors } from './survivors';
import type { DeriveContext } from './view-model';

export interface DemoSummary {
  result: MatchResult;
  ctx: DeriveContext;
}

/** Build the summary inputs for a match id from the demo battery. Replace with the F7 read path. */
export function loadSummaryContext(matchId: string): DemoSummary {
  const replay = battery as unknown as WireReplay;
  const result = replay.result as MatchResult;
  const viewerSide: Side = 'A';

  return {
    result,
    ctx: {
      viewerSide,
      unitOrder: replay.meta.unitOrder,
      tickRate: replay.meta.tickRate,
      opponent: { name: 'CMDR_RIVAL', href: '/profile/rival', hidden: false },
      standing: { mode: 'ranked', delta: 1, before: 47, after: 48 },
      replayRef: { matchId },
      perMachineDamage: perMachineDamageFromEvents(replay.games, replay.meta.unitOrder),
      perGameSurvivors: perGameSurvivors(replay, viewerSide),
    },
  };
}
