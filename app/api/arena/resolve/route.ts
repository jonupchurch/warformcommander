/**
 * Ranked resolve route (Feature 8, T017/T044) — the Node, WASM-invoking P6 boundary. It reads the
 * session server-side (never a client user id), parses the body by **destructuring exactly**
 * `{ attackSquadId, ticketSnapshotId }` — any forged `result`/`winner`/`seed`/`opponentId` field is
 * structurally unreadable, not merely discarded — and hands off to `startRankedMatch`, which resolves
 * + records server-side and returns only a match id (FR-009/010/013, US5).
 */

import { AuthError } from '@/server/authz';
import { requireSession } from '@/server/session';
import { startRankedMatch } from '@/server/arena';
import type { ErrorCode } from '@/server/result';

export const runtime = 'nodejs';

/** Map a business error to an HTTP status (4xx — never leak a 500 for a normal domain outcome). */
function statusFor(error: ErrorCode): number {
  switch (error) {
    case 'NOT_ATTACKABLE':
      return 403;
    case 'INVALID_TICKET':
      return 409;
    case 'NO_OPPONENT':
      return 404;
    default:
      return 422;
  }
}

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
  // The ONLY two fields read from the request (P6 trust boundary).
  const input = {
    attackSquadId: String(body.attackSquadId ?? ''),
    ticketSnapshotId: String(body.ticketSnapshotId ?? ''),
  };

  const result = await startRankedMatch(ctx, input);
  if (result.ok) return Response.json(result.value);
  return Response.json({ error: result.error, reason: result.reason }, { status: statusFor(result.error) });
}
