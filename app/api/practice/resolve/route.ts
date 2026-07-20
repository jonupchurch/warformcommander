/**
 * Practice resolve route (Feature 8, T039/T045) — Node, WASM-invoking. Reads the session server-side
 * and parses the body by destructuring exactly `{ attackSquadId, opponentSquadId }` — no seed/ruleset/
 * outcome field exists to forge. Hands off to `startPracticeMatch` (Free, no standing) and returns a
 * match id.
 */

import { AuthError } from '@/server/authz';
import { requireSession } from '@/server/session';
import { startPracticeMatch } from '@/server/practice';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  let ctx;
  try {
    ctx = await requireSession();
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: 'UNAUTHENTICATED', reason: error.message }, { status: error.status });
    }
    throw error;
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const input = {
    attackSquadId: String(body.attackSquadId ?? ''),
    opponentSquadId: String(body.opponentSquadId ?? ''),
  };

  const result = await startPracticeMatch(ctx, input);
  if (result.ok) return Response.json(result.value);
  const status = result.error === 'NOT_ATTACKABLE' ? 403 : result.error === 'NO_PRACTICE_OPPONENT' ? 404 : 422;
  return Response.json({ error: result.error, reason: result.reason }, { status });
}
