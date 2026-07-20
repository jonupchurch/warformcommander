/**
 * Practice fog (Feature 8, US4) — server-only. A practice opponent hides its **identity** (FR-014),
 * and we also serve its build blind for the same structural reason ranked does: the client only ever
 * receives a {@link MatchTicketPreview} (composition/power/tags), never behavior dials or Plan-B
 * triggers. Shared by the practice page (initial draw) and the redraw Server Action so both project
 * through the exact same allow-list. Server-only by usage (imported solely by the page + action).
 */

import { fogPreview, type MatchTicketPreview, type PracticeDraw } from '@/server/arena-types';
import { loadCurrentRuleset } from '@/server/ruleset';
import { armyPowerRating } from '@/sim/derive';

export interface PracticePreview {
  opponentSquadId: string;
  preview: MatchTicketPreview;
}

/** Project a raw {@link PracticeDraw} to the client-safe, identity-free fogged shape. */
export function toPracticePreview(draw: PracticeDraw): PracticePreview {
  const { ruleset } = loadCurrentRuleset();
  const power = armyPowerRating(draw.opponentConfig, ruleset);
  return { opponentSquadId: draw.opponentSquadId, preview: fogPreview(draw.opponentConfig, ruleset, power) };
}
