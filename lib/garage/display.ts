/**
 * Pure display helpers for the Garage screen — machine-type → icon/label maps, zone metadata, and the
 * projections that turn an {@link EffectiveStats} into the 7 mockup stat bars and the 4 behavior-dial
 * tiles. No React, no state; keeps the components thin and these mappings unit-testable.
 */

import type { MachineTypeKey } from '@/components/brand/unit-icon';
import type { BehaviorDials, MachineTypeId, ZoneId } from '@/sim/model';
import type { DamageFamily, EffectiveStats } from '@/sim/ruleset';

/** A `Chip` tone (subset of the primitive's tones the Garage uses). */
export type ChipTone = 'kinetic' | 'energy' | 'explosive' | 'support' | 'air' | 'front' | 'middle' | 'rear';

/** Machine type → the {@link UnitIcon} SVG key. */
export const UNIT_ICON_KEY: Record<MachineTypeId, MachineTypeKey> = {
  HeavyTank: 'heavytank',
  LightTank: 'lighttank',
  Mech: 'mech',
  AttackHeli: 'heli',
  RocketArtillery: 'rocketarty',
  Artillery: 'artillery',
  RearSupport: 'support',
};

/** Machine type → its human label. */
export const MACHINE_TYPE_LABEL: Record<MachineTypeId, string> = {
  HeavyTank: 'Heavy Tank',
  LightTank: 'Light Tank',
  Mech: 'Mech',
  AttackHeli: 'Attack Heli',
  RocketArtillery: 'Rocket Artillery',
  Artillery: 'Artillery',
  RearSupport: 'Rear Support',
};

/** The seven machine types in a stable pick order. */
export const MACHINE_TYPES: MachineTypeId[] = [
  'HeavyTank',
  'LightTank',
  'Mech',
  'AttackHeli',
  'RocketArtillery',
  'Artillery',
  'RearSupport',
];

/** Zones top-to-bottom as the formation renders them (Air, then Front → Rear). */
export const ZONE_ORDER: ZoneId[] = ['Air', 'Front', 'Middle', 'Rear'];

/** Zone occupancy caps (game rule V2): Air holds 2, ground rows hold 3. */
export const ZONE_CAP: Record<ZoneId, number> = { Air: 2, Front: 3, Middle: 3, Rear: 3 };

/** Zone display label. */
export const ZONE_LABEL: Record<ZoneId, string> = {
  Air: 'AIR',
  Front: 'FRONT',
  Middle: 'MIDDLE',
  Rear: 'REAR',
};

/** Zone → its background utility (the squad-card occupancy dots + zone accents). */
export const ZONE_DOT_CLASS: Record<ZoneId, string> = {
  Air: 'bg-zone-air',
  Front: 'bg-zone-front',
  Middle: 'bg-zone-middle',
  Rear: 'bg-zone-rear',
};

/** Zone → its left-accent border utility (the zone-row rule). */
export const ZONE_BORDER_CLASS: Record<ZoneId, string> = {
  Air: 'border-zone-air',
  Front: 'border-zone-front',
  Middle: 'border-zone-middle',
  Rear: 'border-zone-rear',
};

/** A damage family → its text-color utility (static strings so Tailwind emits them). */
export const FAMILY_TEXT_CLASS: Record<DamageFamily, string> = {
  Kinetic: 'text-family-kinetic',
  Energy: 'text-family-energy',
  Explosive: 'text-family-explosive',
  Support: 'text-family-support',
};

/** A damage family → its `Chip`/text tone. */
export function familyTone(f: DamageFamily): ChipTone {
  switch (f) {
    case 'Kinetic':
      return 'kinetic';
    case 'Energy':
      return 'energy';
    case 'Explosive':
      return 'explosive';
    case 'Support':
      return 'support';
  }
}

/** A zone → its `Chip`/text tone. */
export function zoneTone(z: ZoneId): ChipTone {
  switch (z) {
    case 'Air':
      return 'air';
    case 'Front':
      return 'front';
    case 'Middle':
      return 'middle';
    case 'Rear':
      return 'rear';
  }
}

/** Split a PascalCase enum value into words: `FocusFire` → `Focus Fire`. */
export function humanize(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** Shots per second + label for a cadence tier (tick rate 10/s; ticks 1/3/5/10). */
const CADENCE: Record<EffectiveStats['cadence'], { rate: number; label: string }> = {
  Fast: { rate: 10, label: 'Fast' },
  Medium: { rate: 3.3, label: 'Medium' },
  Slow: { rate: 2, label: 'Slow' },
  Siege: { rate: 1, label: 'Siege' },
};

/** One stat-bar row (matches the `StatBar` primitive's props). */
export interface StatBarSpec {
  label: string;
  value: number;
  max: number;
  display: string;
}

/**
 * The 7 stat bars the mockup shows, in order: HULL, ARMOR, SHIELD, DAMAGE, FIRE RATE, SPEED, EVASION.
 * `Fixed` milli values are divided to whole units for display; `Bp` fractions render as percents; the
 * bar `max` values bound the roster's realistic ranges so the fills read sensibly.
 */
export function statBars(e: EffectiveStats): StatBarSpec[] {
  const cadence = CADENCE[e.cadence];
  const armorPct = e.armorPct / 100; // bp → percent
  const evasionPct = e.evasion / 100;
  return [
    { label: 'HULL', value: e.hull / 1000, max: 2400, display: String(Math.round(e.hull / 1000)) },
    { label: 'ARMOR', value: armorPct, max: 50, display: `${Math.round(armorPct)}%` },
    { label: 'SHIELD', value: e.shieldCap / 1000, max: 300, display: String(Math.round(e.shieldCap / 1000)) },
    { label: 'DAMAGE', value: e.damage / 1000, max: 90, display: String(Math.round(e.damage / 1000)) },
    { label: 'FIRE RATE', value: cadence.rate, max: 10, display: cadence.label },
    {
      label: 'SPEED',
      value: e.moveSpeed ?? 0,
      max: 8,
      display: e.moveSpeed === null ? 'AIR' : String(e.moveSpeed),
    },
    { label: 'EVASION', value: evasionPct, max: 50, display: `${Math.round(evasionPct)}%` },
  ];
}

/** One behavior-dial tile (matches the `Stat` primitive's props). */
export interface DialTileSpec {
  label: string;
  value: string;
}

/** The 4 behavior-dial tiles: TARGET, ENERGY, POSITION, STANCE. */
export function dialTiles(dials: BehaviorDials): DialTileSpec[] {
  return [
    { label: 'TARGET', value: humanize(dials.targetRule) },
    { label: 'ENERGY', value: humanize(dials.energy) },
    { label: 'POSITION', value: humanize(dials.movement) },
    { label: 'STANCE', value: humanize(dials.stance) },
  ];
}
