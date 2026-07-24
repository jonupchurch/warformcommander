/**
 * Pure dial + Plan-B option data (v3). The targeting-chain filters + fallback selector, the three
 * universal stances, the four movement modes, and the Plan-B condition/response menu (design §15.4).
 *
 * v3 removed **all** capability-gated dial options (the engine dropped V7 dial-gating), so every
 * option here is freely selectable. Unit-tested against `validateArmy`.
 */

import type {
  DialKey,
  DialValue,
  MovementMode,
  PlanBTrigger,
  Stance,
  TargetFilter,
  TargetSelector,
  TriggerCondition,
} from '@/sim/model';

import { humanize } from './display';

/** The targeting-chain class filters (a priority tier; an unset tier is "Any"). */
export const TARGET_FILTER_OPTIONS: TargetFilter[] = [
  'TargetAir',
  'TargetArmor',
  'TargetSupport',
  'TargetIndirect',
  'Follow',
];

/** The positional fallback selectors (always resolves). */
export const TARGET_SELECTOR_OPTIONS: TargetSelector[] = ['Closest', 'Furthest'];

/** Movement dial options (v3) — the four self-terminating modes, no gates. */
export const MOVEMENT_OPTIONS: MovementMode[] = ['Hold', 'Advance', 'FallBack', 'Kite'];

/** Stance dial options (v3) — the three universal postures (every machine may hold any). */
export const STANCE_OPTIONS: Stance[] = ['Aggressive', 'Neutral', 'Defensive'];

/** A short human label for a targeting filter (or "Any" for an unused priority tier). */
export function describeFilter(f: TargetFilter | undefined): string {
  if (!f) return 'Any (no filter)';
  switch (f) {
    case 'TargetAir':
      return 'Aircraft';
    case 'TargetArmor':
      return 'Armored';
    case 'TargetSupport':
      return 'Support';
    case 'TargetIndirect':
      return 'Artillery';
    case 'Follow':
      return 'Follow ally';
  }
}

/** A Plan-B trigger condition preset (a representative §15.4 subset with fixed payloads). */
export interface ConditionPreset {
  label: string;
  value: TriggerCondition;
}

/** The Plan-B condition menu — **own-state only** in v3 (enemy-reactive conditions were dropped). */
export const PLANB_CONDITIONS: ConditionPreset[] = [
  { label: 'Hull below 50%', value: { HullBelowPct: 5000 } },
  { label: 'Hull below 25%', value: { HullBelowPct: 2500 } },
  { label: 'Shield down', value: 'ShieldDown' },
  { label: 'Ally lost in zone', value: 'AllyLostInZone' },
  { label: 'No targets reachable', value: 'NoTargetsReachable' },
];

/** A Plan-B response preset — the (dial, value) pair a trigger latches. Movement/Stance only (v3). */
export interface ResponsePreset {
  label: string;
  dial: DialKey;
  planBValue: DialValue;
}

export const PLANB_RESPONSES: ResponsePreset[] = [
  { label: 'Position → Fall Back', dial: 'Movement', planBValue: { Movement: 'FallBack' } },
  { label: 'Position → Advance', dial: 'Movement', planBValue: { Movement: 'Advance' } },
  { label: 'Position → Kite', dial: 'Movement', planBValue: { Movement: 'Kite' } },
  { label: 'Position → Hold', dial: 'Movement', planBValue: { Movement: 'Hold' } },
  { label: 'Stance → Defensive', dial: 'Stance', planBValue: { Stance: 'Defensive' } },
  { label: 'Stance → Aggressive', dial: 'Stance', planBValue: { Stance: 'Aggressive' } },
  { label: 'Stance → Balanced', dial: 'Stance', planBValue: { Stance: 'Neutral' } },
];

/** A human description of a trigger condition (handles the tagged payload variants). */
export function describeCondition(c: TriggerCondition): string {
  if (typeof c === 'string') return humanize(c);
  if ('HullBelowPct' in c) return `Hull below ${c.HullBelowPct / 100}%`;
  if ('AfterTick' in c) return `After tick ${c.AfterTick}`;
  return 'condition';
}

/** A human description of a trigger's response (`dial → value`). */
export function describeResponse(t: PlanBTrigger): string {
  const [dial, value] = Object.entries(t.planBValue)[0];
  return `${dial} → ${humanize(String(value))}`;
}
