/**
 * The live-ruleset seam (Feature 8, T008) — the resolve path reads "the current ruleset" through this
 * ONE function so Feature 12's future editable store (or an added Feature-7 `rulesets` table) swaps in
 * with **zero change** to `startRankedMatch`/`startPracticeMatch`.
 *
 * v1 returns the engine's committed **default** ruleset (`loadDefaultRuleset`, cached). The ruleset's
 * hash is BLAKE3-computed *by the engine* and stamped into `replay.meta.rulesetHash` at resolve time —
 * `recordMatch` persists it from there — so no hash needs to travel with the ruleset here.
 */

import { loadDefaultRuleset } from '@/sim/validate';
import type { Ruleset } from '@/sim/model';

/** The ruleset the resolve path simulates + validates against (v1: the engine default). */
export function loadCurrentRuleset(): { ruleset: Ruleset } {
  return { ruleset: loadDefaultRuleset() };
}
