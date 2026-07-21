/**
 * Badge derivation (Feature 10) — **pure, cosmetic, no store** (P1, SC-004/SC-005). A typed static
 * catalog whose every `measure` reads only `CareerStats` counters, evaluated by a total pure
 * `deriveBadges`. No badges/achievements table is read or written; a `BadgeView` carries only display
 * fields, so crossing a threshold flips a picture and nothing else.
 */

import type { BadgeDefinition, BadgeView, CareerStats } from './profile-types';

/** v1 catalog — every measure exists on `ladder_standings`; deferred criteria are omitted, not faked. */
export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  { id: 'first-deployment', name: 'First Deployment', desc: 'Play your first ranked match.', icon: { kind: 'star' }, goal: 1, measure: (c) => c.matchesPlayed },
  { id: 'net-positive', name: 'Net Positive', desc: 'Reach a positive net-victory total.', icon: { kind: 'star' }, goal: 1, measure: (c) => c.netVictories },
  { id: 'hot-streak', name: 'Hot Streak', desc: 'Win 10 matches in a row.', icon: { kind: 'unit', type: 'heli' }, goal: 10, measure: (c) => c.bestStreak },
  { id: 'veteran', name: 'Veteran', desc: 'Play 100 matches.', icon: { kind: 'unit', type: 'mech' }, goal: 100, measure: (c) => c.matchesPlayed },
  { id: 'centurion', name: 'Centurion', desc: 'Win 100 matches.', icon: { kind: 'unit', type: 'heavytank' }, goal: 100, measure: (c) => c.wins },
  { id: 'ace-defender', name: 'Ace Defender', desc: 'Hold defense 100 times.', icon: { kind: 'unit', type: 'support' }, goal: 100, measure: (c) => c.defenseWins },
  { id: 'ascendant', name: 'Ascendant', desc: 'Reach 100 net victories.', icon: { kind: 'star' }, goal: 100, measure: (c) => c.netVictories },
  { id: 'heavy-ordnance', name: 'Heavy Ordnance', desc: 'Deal 1,000,000 total damage.', icon: { kind: 'unit', type: 'artillery' }, goal: 1_000_000, measure: (c) => c.totalDamage },
  { id: 'grizzled', name: 'Grizzled', desc: 'Play 500 matches.', icon: { kind: 'unit', type: 'heavytank' }, goal: 500, measure: (c) => c.matchesPlayed },
  { id: 'devastator', name: 'Devastator', desc: 'Deal 10,000,000 total damage.', icon: { kind: 'unit', type: 'rocketarty' }, goal: 10_000_000, measure: (c) => c.totalDamage },
];

/** Derive the badge display set from career stats — pure: same input ⇒ same output, no I/O. */
export function deriveBadges(career: CareerStats): BadgeView[] {
  return BADGE_CATALOG.map((def) => {
    const measure = def.measure(career);
    const earned = measure >= def.goal;
    return {
      id: def.id,
      name: def.name,
      desc: def.desc,
      icon: def.icon,
      state: earned ? 'earned' : 'in-progress',
      progress: Math.min(measure / def.goal, 1),
      progressText: `${measure.toLocaleString()} / ${def.goal.toLocaleString()}`,
    };
  });
}
