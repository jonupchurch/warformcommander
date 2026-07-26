/**
 * The **derived** editor views — `ValidationView` and `StatPreview` (data-model). Both are computed
 * from the draft + ruleset via Feature 1's shared functions and are **never stored** (the hook
 * memoizes them during render, [research A2]). Pure + unit-testable; the numbers come from
 * `deriveEffectiveStats`/`validateArmy`, so the preview **equals** the engine's derivation (SC-002).
 */

import { validateDeckRules } from '@/sim/deck-rules';
import { armyPowerRating, deriveEffectiveStats, powerRating } from '@/sim/derive';
import { validateArmy, type ValidationError } from '@/sim/legality';
import type { EffectiveStats, Ruleset } from '@/sim/ruleset';

import { toSquadConfig } from './to-squad-config';
import type { DraftMachine, DraftSquad, SlotIndex } from './types';

/**
 * The client rendering of `validate()` — indexed so a reason can be shown against the offending
 * element (Principle II; FR-016). `isLegal` gates the **Save button** (client convenience only; the
 * server-side `validate` in Feature 7 is the authority).
 */
export interface ValidationView {
  isLegal: boolean;
  errors: ValidationError[];
  /** Errors attributed to a machine, keyed by its slot index (`instanceId`). */
  bySlot: Record<number, ValidationError[]>;
  /** Army-level reasons (squad size, zone caps) — `instanceId === null`. */
  squadLevel: ValidationError[];
}

/** Index a flat error list by slot / army level for per-element display. */
export function toValidationView(errors: ValidationError[]): ValidationView {
  const bySlot: Record<number, ValidationError[]> = {};
  const squadLevel: ValidationError[] = [];
  for (const e of errors) {
    if (e.instanceId === null) squadLevel.push(e);
    else (bySlot[e.instanceId] ??= []).push(e);
  }
  return { isLegal: errors.length === 0, errors, bySlot, squadLevel };
}

/** Validate the whole draft (projected to a `SquadConfig`) and index the result. Runs the engine's
 *  V1–V8 legality **and** the construction-layer deckbuilding caps (`validateDeckRules`) the server
 *  write path also enforces, so the Save button reflects every reason a save would be rejected. */
export function computeValidationView(draft: DraftSquad, ruleset: Ruleset): ValidationView {
  const config = toSquadConfig(draft);
  return toValidationView([...validateArmy(config, ruleset), ...validateDeckRules(config, ruleset)]);
}

/** The live derived readout for the selected machine + the squad aggregate. */
export interface StatPreview {
  /** The selected machine's effective stats (`null` if nothing selected or a structural fault). */
  effective: EffectiveStats | null;
  /** The selected machine's matchmaking power (milli-units). */
  machinePower: number;
  /** The squad's aggregate matchmaking power (whole units; mirrors Feature 7 `squads.powerRating`). */
  squadPower: number;
  /** Whether the selected machine's weapon matches its type's native family (the P1 sidegrade tell). */
  nativeBonusApplies: boolean;
  /** Squad readouts: `AA READY`/`NO AA` + the damage families the squad fields. */
  summaryTags: string[];
}

/** Derive a single machine's effective stats, or `null` on a structural fault. */
function derivedOrNull(machine: DraftMachine, ruleset: Ruleset): EffectiveStats | null {
  const r = deriveEffectiveStats(machine, ruleset);
  return r.ok ? r.stats : null;
}

/** Compute the {@link StatPreview} for the current draft + selection. */
export function computeStatPreview(
  draft: DraftSquad,
  selectedSlot: SlotIndex | null,
  ruleset: Ruleset,
): StatPreview {
  const selected = selectedSlot === null ? null : draft.machines[selectedSlot];
  const effective = selected ? derivedOrNull(selected, ruleset) : null;

  let aaReady = false;
  const families = new Set<string>();
  for (const m of draft.machines) {
    if (m === null) continue;
    const stats = derivedOrNull(m, ruleset);
    if (!stats) continue;
    if (stats.canTargetAir) aaReady = true;
    families.add(stats.family);
  }

  const summaryTags = [aaReady ? 'AA READY' : 'NO AA', ...[...families].sort()];

  return {
    effective,
    machinePower: effective ? powerRating(effective) : 0,
    squadPower: armyPowerRating(toSquadConfig(draft), ruleset),
    nativeBonusApplies: effective?.nativeMatch ?? false,
    summaryTags,
  };
}
