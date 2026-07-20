/**
 * Feature 8 route-level anti-forgery (US5, T041/T045) — the P6 trust boundary at the HTTP edge. A
 * forged `result`/`winner`/`seed`/`opponentId` in the request body must be **structurally
 * unreadable**: the route destructures exactly the two allowed fields, so the orchestrator can only
 * ever receive `{ attackSquadId, ticketSnapshotId }` (ranked) / `{ attackSquadId, opponentSquadId }`
 * (practice) — never a client-chosen opponent, seed, or outcome. These tests capture what the route
 * hands the orchestrator and assert the forged keys never survive.
 *
 * Mock-based (no DB): the anti-forgery guarantee is about *parsing*, not persistence — the DB-level
 * record/reproduce guarantees live in `arena.test.ts`/`practice.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '@/server/authz';

const requireSession = vi.fn();
const startRankedMatch = vi.fn();
const startPracticeMatch = vi.fn();

vi.mock('@/server/session', () => ({ requireSession: () => requireSession() }));
vi.mock('@/server/arena', () => ({ startRankedMatch: (...a: unknown[]) => startRankedMatch(...a) }));
vi.mock('@/server/practice', () => ({ startPracticeMatch: (...a: unknown[]) => startPracticeMatch(...a) }));

const { POST: rankedPost } = await import('@/app/api/arena/resolve/route');
const { POST: practicePost } = await import('@/app/api/practice/resolve/route');

const ACTOR = { id: 'attacker-1', role: 'user' as const };

function jsonRequest(body: unknown): Request {
  return new Request('http://local/api/arena/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.clearAllMocks());

describe('POST /api/arena/resolve — strict parse ignores forged fields (T041/T044)', () => {
  it('passes ONLY { attackSquadId, ticketSnapshotId } to the orchestrator — forged keys never survive', async () => {
    requireSession.mockResolvedValue(ACTOR);
    startRankedMatch.mockResolvedValue({ ok: true, value: { matchId: 'm-real' } });

    const res = await rankedPost(
      jsonRequest({
        attackSquadId: 'sq-1',
        ticketSnapshotId: 'snap-1',
        // forged — must be structurally unreadable:
        result: { winner: 'A' },
        winner: 'A',
        seed: 999,
        opponentId: 'i-picked-this',
        ctx: { id: 'admin' },
      }),
    );

    expect(startRankedMatch).toHaveBeenCalledTimes(1);
    const [ctxArg, inputArg] = startRankedMatch.mock.calls[0];
    // The actor comes from the server session, never the body.
    expect(ctxArg).toEqual(ACTOR);
    // Exactly the two allow-listed fields — nothing forged rode along.
    expect(Object.keys(inputArg as object).sort()).toEqual(['attackSquadId', 'ticketSnapshotId']);
    expect(inputArg).toEqual({ attackSquadId: 'sq-1', ticketSnapshotId: 'snap-1' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matchId: 'm-real' });
  });

  it('coerces missing fields to empty strings (no undefined leaks to the orchestrator)', async () => {
    requireSession.mockResolvedValue(ACTOR);
    startRankedMatch.mockResolvedValue({ ok: false, error: 'NOT_ATTACKABLE', reason: 'x' });

    const res = await rankedPost(jsonRequest({ seed: 1 }));
    const [, inputArg] = startRankedMatch.mock.calls[0];
    expect(inputArg).toEqual({ attackSquadId: '', ticketSnapshotId: '' });
    expect(res.status).toBe(403); // NOT_ATTACKABLE → 403
  });

  it('maps a thrown AuthError to its status and never calls the orchestrator', async () => {
    requireSession.mockRejectedValue(new AuthError(401, 'authentication required'));

    const res = await rankedPost(jsonRequest({ attackSquadId: 'sq-1', ticketSnapshotId: 'snap-1' }));
    expect(res.status).toBe(401);
    expect(startRankedMatch).not.toHaveBeenCalled();
  });

  it('maps INVALID_TICKET → 409 and NO_OPPONENT → 404', async () => {
    requireSession.mockResolvedValue(ACTOR);
    startRankedMatch.mockResolvedValueOnce({ ok: false, error: 'INVALID_TICKET', reason: 'x' });
    expect((await rankedPost(jsonRequest({ attackSquadId: 'a', ticketSnapshotId: 'b' }))).status).toBe(409);
    startRankedMatch.mockResolvedValueOnce({ ok: false, error: 'NO_OPPONENT', reason: 'x' });
    expect((await rankedPost(jsonRequest({ attackSquadId: 'a', ticketSnapshotId: 'b' }))).status).toBe(404);
  });
});

describe('POST /api/practice/resolve — strict parse ignores forged fields (T045)', () => {
  it('passes ONLY { attackSquadId, opponentSquadId } — forged outcome/seed never survive', async () => {
    requireSession.mockResolvedValue(ACTOR);
    startPracticeMatch.mockResolvedValue({ ok: true, value: { matchId: 'p-real' } });

    const res = await practicePost(
      jsonRequest({
        attackSquadId: 'sq-9',
        opponentSquadId: 'opp-3',
        result: { winner: 'B' },
        seed: 7,
        winner: 'B',
      }),
    );

    const [, inputArg] = startPracticeMatch.mock.calls[0];
    expect(Object.keys(inputArg as object).sort()).toEqual(['attackSquadId', 'opponentSquadId']);
    expect(inputArg).toEqual({ attackSquadId: 'sq-9', opponentSquadId: 'opp-3' });
    expect(await res.json()).toEqual({ matchId: 'p-real' });
  });

  it('maps NO_PRACTICE_OPPONENT → 404', async () => {
    requireSession.mockResolvedValue(ACTOR);
    startPracticeMatch.mockResolvedValue({ ok: false, error: 'NO_PRACTICE_OPPONENT', reason: 'x' });
    const res = await practicePost(jsonRequest({ attackSquadId: 'a', opponentSquadId: 'b' }));
    expect(res.status).toBe(404);
  });
});
