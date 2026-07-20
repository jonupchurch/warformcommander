'use server';

/**
 * Arena Server Actions (Feature 8, US2) — the skip/re-roll seam. `rerollOpponent` re-runs
 * matchmaking + fog projection and returns a **fresh** {@link MatchTicket}. It records nothing and
 * moves no standing (FR-006) — the only write in this feature is `startRankedMatch`, reached solely
 * through the Node resolve route (P6). The session is resolved server-side here, never trusted from
 * the client.
 */

import { previewRankedMatch } from '@/server/arena';
import type { MatchTicket } from '@/server/arena-types';
import { requireSession } from '@/server/session';
import type { ErrorCode } from '@/server/result';

export type RerollResult = { ok: true; ticket: MatchTicket } | { ok: false; error: ErrorCode; reason?: string };

/** Re-roll the matched opponent (no write). Returns a fresh fogged ticket or a typed reason. */
export async function rerollOpponent(): Promise<RerollResult> {
  const ctx = await requireSession();
  const result = await previewRankedMatch(ctx);
  if (result.ok) return { ok: true, ticket: result.value };
  return { ok: false, error: result.error, reason: result.reason };
}
