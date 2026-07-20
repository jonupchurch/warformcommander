/**
 * Match read for the viewer-facing screens (Feature 8 — cashing in the F5/F6 read-path seam). The
 * Battle Playback (F5) and Battle Summary (F6) routes were built against a committed demo battery
 * until Feature 7's ownership-scoped read path landed; now that ranked/practice matches are recorded
 * (F8), these helpers resolve a **real** persisted match by id into the exact shapes those routes
 * already consume — so the arena deploy → summary → replay loop is real end-to-end.
 *
 * Server-only (reads the DB). Returns `null` when the id is not a real match, letting each route fall
 * back to its demo seam (which keeps the `e2e-*` demo links and their e2e specs working).
 */

import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { users } from '@/db/schema';
import { perMachineDamageFromEvents } from '@/lib/battle-summary/mvp';
import { perGameSurvivors } from '@/lib/battle-summary/survivors';
import type { DeriveContext } from '@/lib/battle-summary/view-model';
import type { MatchResult, Side } from '@/sim/model';
import type { WireReplay } from '@/sim/replay-reader';

import { getMatch, getReplay } from './matches';
import { getStanding } from './standings';

/**
 * `matches.id` is a Postgres `uuid`, which **errors** (not empty-result) on a non-uuid string. Real
 * recorded ids are uuids; the demo/e2e ids (`e2e-match`, …) are not — so a shape check cleanly routes
 * a non-real id to the demo fallback instead of throwing a 500 inside the read.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The viewer's side in a match: they are the attacker (A) unless they are the recorded defender. */
function viewerSideOf(
  match: { attackerUserId: string | null; defenderUserId: string | null },
  viewerId?: string,
): Side {
  return viewerId && match.defenderUserId === viewerId ? 'B' : 'A';
}

async function userName(userId: string | null): Promise<string | undefined> {
  if (!userId) return undefined;
  const [row] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.name ?? undefined;
}

export interface RealSummary {
  result: MatchResult;
  ctx: DeriveContext;
}

/**
 * Build the Battle Summary inputs for a real match id, scoped to `viewerId` (the signed-in user).
 * Returns `null` if the id is not a real match. Practice hides the opponent identity and shows an
 * unranked standing; ranked shows the opponent name + the viewer's net-victory movement.
 */
export async function loadRealSummary(matchId: string, viewerId?: string): Promise<RealSummary | null> {
  if (!UUID_RE.test(matchId)) return null;
  const match = await getMatch(matchId);
  if (!match.ok) return null;
  const replayResult = await getReplay(matchId);
  if (!replayResult.ok) return null;

  const replay = replayResult.value as WireReplay;
  const result = replay.result as MatchResult;
  const viewerSide = viewerSideOf(match.value, viewerId);
  const isPractice = match.value.mode === 'practice';
  const viewerWon = result.winner === viewerSide;

  // Net-victory movement for THIS viewer from THIS match (§13): an attack win is +1; an attack loss
  // moves nothing; a defense loss is −1. Practice never moves standing.
  let standing: DeriveContext['standing'];
  if (isPractice) {
    standing = { mode: 'practice' };
  } else {
    const delta = viewerSide === 'A' ? (viewerWon ? 1 : 0) : viewerWon ? 0 : -1;
    let after: number | undefined;
    if (viewerId) {
      const current = await getStanding(viewerId);
      if (current.ok && current.value.netVictories != null) after = current.value.netVictories;
    }
    const before = after === undefined ? undefined : after - delta;
    standing = { mode: 'ranked', delta, before, after };
  }

  // The opponent is the other side. Practice never reveals who it was (FR-014).
  const opponentId = viewerSide === 'A' ? match.value.defenderUserId : match.value.attackerUserId;
  const opponent: DeriveContext['opponent'] = isPractice
    ? { hidden: true }
    : { hidden: false, name: (await userName(opponentId)) ?? 'COMMANDER' };

  return {
    result,
    ctx: {
      viewerSide,
      unitOrder: replay.meta.unitOrder,
      tickRate: replay.meta.tickRate,
      opponent,
      standing,
      replayRef: { matchId },
      perMachineDamage: perMachineDamageFromEvents(replay.games, replay.meta.unitOrder),
      perGameSurvivors: perGameSurvivors(replay, viewerSide),
    },
  };
}

export interface RealReplay {
  replay: WireReplay;
  playerSide: Side;
}

/** Load a real match's replay + the viewer's side for the Battle Playback route. `null` if not real. */
export async function loadRealReplay(matchId: string, viewerId?: string): Promise<RealReplay | null> {
  if (!UUID_RE.test(matchId)) return null;
  const match = await getMatch(matchId);
  if (!match.ok) return null;
  const replayResult = await getReplay(matchId);
  if (!replayResult.ok) return null;
  return { replay: replayResult.value as WireReplay, playerSide: viewerSideOf(match.value, viewerId) };
}
