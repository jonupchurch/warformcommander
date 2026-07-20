/**
 * Pure dial + Plan-B option data (US3). The dial option lists, the **capability gate table** (which
 * mirrors the engine's `check_dial_gating` exactly — the only gated options are Adaptive energy,
 * Opportunist stance, and the Target-Air rule; everything else is freely selectable, P8), and a
 * representative Plan-B condition/response menu (§8.2). Unit-tested against `validateArmy`.
 */

import type {
  BehaviorDials,
  DialKey,
  DialValue,
  EnergyMode,
  MovementMode,
  PlanBTrigger,
  Stance,
  TargetRow,
  TargetRule,
  TriggerCondition,
} from '@/sim/model';
import type { Capability } from '@/sim/ruleset';

import { humanize } from './display';

export const TARGET_ROW_OPTIONS: TargetRow[] = [
  'FrontReachable',
  'LastReachable',
  'FullestRow',
  'WeakestRow',
];
export const TARGET_RULE_OPTIONS: TargetRule[] = [
  'FocusFire',
  'DisperseFire',
  'Nearest',
  'Weakest',
  'BiggestThreat',
  'TargetSupport',
  'TargetAir',
  'SmartCounter',
];
export const ENERGY_OPTIONS: EnergyMode[] = [
  'Offense',
  'Balanced',
  'Defense',
  'Overdrive',
  'Fortify',
  'Adaptive',
];
export const MOVEMENT_OPTIONS: MovementMode[] = [
  'Hold',
  'Advance',
  'FallBack',
  'Kite',
  'Reposition',
  'Escort',
];
export const STANCE_OPTIONS: Stance[] = [
  'Aggressive',
  'Neutral',
  'Defensive',
  'Protector',
  'Opportunist',
  'Triage',
  'Sustain',
  'Empower',
];

/**
 * The dial options the engine gates behind a capability — **mirrors `validate.rs::check_dial_gating`
 * exactly**. Only these three are gated; any other option is legal (so the editor must not disable it,
 * or it would diverge from the engine, P8).
 */
export const DIAL_GATE: Partial<Record<keyof BehaviorDials, Record<string, Capability>>> = {
  energy: { Adaptive: 'AdaptiveEnergy' },
  stance: { Opportunist: 'OpportunistStance' },
  targetRule: { TargetAir: 'TargetAir' },
};

/** Whether a dial option is locked — gated by a capability the machine hasn't unlocked. */
export function dialOptionLocked(
  dial: keyof BehaviorDials,
  option: string,
  caps: readonly Capability[],
): boolean {
  const needs = DIAL_GATE[dial]?.[option];
  return needs !== undefined && !caps.includes(needs);
}

/** A Plan-B trigger condition preset (a representative §8.2 subset with fixed payloads). */
export interface ConditionPreset {
  label: string;
  value: TriggerCondition;
}

export const PLANB_CONDITIONS: ConditionPreset[] = [
  { label: 'Hull below 50%', value: { HullBelowPct: 5000 } },
  { label: 'Hull below 25%', value: { HullBelowPct: 2500 } },
  { label: 'Shield down', value: 'ShieldDown' },
  { label: 'Ally lost in zone', value: 'AllyLostInZone' },
  { label: 'Air enemy present', value: 'AirEnemyExists' },
];

/** A Plan-B response preset — the (dial, value) pair a trigger latches. */
export interface ResponsePreset {
  label: string;
  dial: DialKey;
  planBValue: DialValue;
}

export const PLANB_RESPONSES: ResponsePreset[] = [
  { label: 'Energy → Overdrive', dial: 'Energy', planBValue: { Energy: 'Overdrive' } },
  { label: 'Energy → Fortify', dial: 'Energy', planBValue: { Energy: 'Fortify' } },
  { label: 'Position → Fall Back', dial: 'Movement', planBValue: { Movement: 'FallBack' } },
  { label: 'Position → Advance', dial: 'Movement', planBValue: { Movement: 'Advance' } },
  { label: 'Stance → Defensive', dial: 'Stance', planBValue: { Stance: 'Defensive' } },
  { label: 'Stance → Aggressive', dial: 'Stance', planBValue: { Stance: 'Aggressive' } },
];

/** A human description of a trigger condition (handles the tagged payload variants). */
export function describeCondition(c: TriggerCondition): string {
  if (typeof c === 'string') return humanize(c);
  if ('HullBelowPct' in c) return `Hull below ${c.HullBelowPct / 100}%`;
  if ('AfterTick' in c) return `After tick ${c.AfterTick}`;
  if ('EnemyInZone' in c) return `Enemy in ${c.EnemyInZone}`;
  return 'condition';
}

/** A human description of a trigger's response (`dial → value`). */
export function describeResponse(t: PlanBTrigger): string {
  const [dial, value] = Object.entries(t.planBValue)[0];
  return `${dial} → ${humanize(String(value))}`;
}
