/**
 * **Construction-layer deckbuilding caps** (v3 balance) — game-design limits on how a squad may be
 * *built*, sitting **above** the engine's V1–V8 battle legality (`sim/legality.ts`, `sim/validate.ts`).
 *
 * These are not physics the deterministic engine simulates, so they deliberately live **outside** the
 * wasm engine: no Rust change, no wasm rebuild, and no coupling to the `validateArmy == engine` parity
 * fixture. They are enforced at the two construction boundaries — the Garage edit-time preview
 * (`computeValidationView`) and the server write path (`saveSquad` / `updateSquad`) — so a squad can
 * only be **saved** if it complies. (Battle resolution itself is unchanged; an already-stored squad is
 * still simulated faithfully.)
 *
 * The caps:
 * - **D1 — Type cap:** at most {@link MAX_PER_TYPE} machines of any one unit type. Forces roster
 *   diversity by construction (no 3-of-a-kind stacks).
 * - **D2 — Indirect cap:** at most {@link MAX_INDIRECT} machine carrying a **backline-reaching**
 *   weapon (reach `AnyGround` or `Deep`) — the weapons that bypass the rank-screen and can delete the
 *   enemy backline from tick 0. This is a *reach* property, not a unit type, so it counts artillery
 *   **and** Railgun heavies alike. Measured driver of the narrow meta: two backline snipers win ~80%
 *   vs the field; capping to one collapses that to ~35%.
 */

import type { ValidationError } from './legality';
import type { Army } from './model';
import type { ReachTag, Ruleset } from './ruleset';

/** At most this many machines of any single unit type per squad (D1). */
export const MAX_PER_TYPE = 2;
/** At most this many backline-reaching (rank-screen-bypassing) weapons per squad (D2). */
export const MAX_INDIRECT = 1;

/** Weapon reach classes that BYPASS the rank-screen — fire on any rank from any row (engine
 *  `target.rs`). These are the "backline snipers"; every other reach respects the rank-screen. */
const INDIRECT_REACH: ReadonlySet<ReachTag> = new Set<ReachTag>(['AnyGround', 'Deep']);

/** Does this weapon reach the enemy backline directly (bypassing the rank-screen)? A missing weapon or
 *  a projector (no reach) is not indirect. Exported so the Garage can flag the offending slots. */
export function isIndirectWeapon(weaponId: string, ruleset: Ruleset): boolean {
  const w = ruleset.equipment[weaponId];
  if (!w || w.kind !== 'Weapon') return false;
  const reach = w.statDeltas?.reach;
  return reach != null && INDIRECT_REACH.has(reach);
}

/**
 * Check the construction-layer caps (D1 + D2) — returns **every** violation (empty array = compliant),
 * in a deterministic order (D1 by first-seen type, then D2). Army-level rejections (`instanceId: null`),
 * mirroring how the engine reports squad-wide rules (V1/V2).
 */
export function validateDeckRules(army: Army, ruleset: Ruleset): ValidationError[] {
  const errors: ValidationError[] = [];

  // D1 — per-type cap (first-seen order → deterministic).
  const typeCounts = new Map<string, number>();
  for (const m of army.machines) {
    typeCounts.set(m.typeId, (typeCounts.get(m.typeId) ?? 0) + 1);
  }
  for (const [typeId, n] of typeCounts) {
    if (n > MAX_PER_TYPE) {
      errors.push({
        code: 'DeckTypeCap',
        instanceId: null,
        reason: `${n} ${typeId} units exceed the limit of ${MAX_PER_TYPE} of any one type`,
      });
    }
  }

  // D2 — backline-indirect (rank-screen-bypassing) cap.
  const indirect = army.machines.filter((m) => isIndirectWeapon(m.loadout.weapon, ruleset));
  if (indirect.length > MAX_INDIRECT) {
    errors.push({
      code: 'DeckIndirectCap',
      instanceId: null,
      reason: `${indirect.length} units carry a backline-reaching weapon (AnyGround/Deep reach); at most ${MAX_INDIRECT} is allowed`,
    });
  }

  return errors;
}
