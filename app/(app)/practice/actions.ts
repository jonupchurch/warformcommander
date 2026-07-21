'use server';

/**
 * Practice Server Actions (Feature 8, US4) — the refresh seam. `redrawOpponent` re-draws a random
 * hidden squad (excluding the one currently shown) and returns a fresh identity-free fogged preview.
 * It records nothing and moves no standing (FR-015). The session is resolved server-side; the only
 * client input is which draw to avoid.
 */

import { refreshPracticeOpponent } from '@/server/practice';
import { requireSession } from '@/server/session';
import type { ErrorCode } from '@/server/result';

import { toPracticePreview, type PracticePreview } from './fog';

export type RedrawResult =
  | { ok: true; draw: PracticePreview }
  | { ok: false; error: ErrorCode; reason?: string };

/** Re-draw a hidden practice opponent, avoiding `currentSquadId`. No write, no standing change. */
export async function redrawOpponent(currentSquadId?: string): Promise<RedrawResult> {
  const ctx = await requireSession();
  const result = await refreshPracticeOpponent(ctx, currentSquadId);
  if (result.ok) return { ok: true, draw: await toPracticePreview(result.value) };
  return { ok: false, error: result.error, reason: result.reason };
}
