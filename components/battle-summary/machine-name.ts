/**
 * `MachineTypeKey` → human label (Feature 6) — shared by the per-machine fate rows and the MVP card
 * for display + `UnitIcon` accessible names. Mirrors the closed 7-type set.
 */

import type { MachineTypeKey } from '@/components/brand/unit-icon';

export const MACHINE_LABEL: Record<MachineTypeKey, string> = {
  heavytank: 'Heavy Tank',
  lighttank: 'Light Tank',
  mech: 'Mech',
  heli: 'Attack Heli',
  rocketarty: 'Rocket Artillery',
  artillery: 'Artillery',
  support: 'Rear Support',
};
