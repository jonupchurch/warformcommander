/**
 * Test fixtures for Feature 5 playback. The **battery** replay is a real wire replay emitted by the
 * native engine (`cargo run -p engine --example emit_battery`; native == wasm byte-identical, P6) — a
 * 2-game Bo3, 145 ticks/game, with `death` + `support` events. Synthetic replays cover what the
 * battery doesn't: a **large** (1000-tick) replay for the O(1)-seek read-count check, a **planb**
 * marker case, a **tiny** battle (divide-by-zero guard), and an **unsupported** formatVersion.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SCALE, type SnapshotRow, type WireEvent, type WireReplay, type WireUnit } from '@/sim/replay-reader';

/** The real native-emitted Bo3 wire replay (SC-001 parity fixture). */
export function loadBatteryReplay(): WireReplay {
  const path = join(process.cwd(), 'tests', 'fixtures', 'replay-battery.json');
  return JSON.parse(readFileSync(path, 'utf8')) as WireReplay;
}

const DEFAULT_UNITS: WireUnit[] = [
  { side: 'A', instanceId: 0, typeId: 'HeavyTank', variantId: 'Grizzly' },
  { side: 'A', instanceId: 1, typeId: 'AttackHeli', variantId: 'Gunship' },
  { side: 'B', instanceId: 0, typeId: 'RocketArtillery', variantId: 'Sentry' },
  { side: 'B', instanceId: 1, typeId: 'RearSupport', variantId: 'Medic' },
];

/** Build a minimal conforming wire replay: linear hull decay over `ticks`, events injected by tick. */
export function makeSyntheticReplay(opts: {
  ticks: number;
  units?: WireUnit[];
  eventsAt?: Record<number, WireEvent[]>;
  formatVersion?: number;
}): WireReplay {
  const units = opts.units ?? DEFAULT_UNITS;
  const maxHull = 1000 * SCALE;
  const zoneOf = (u: WireUnit): number => (u.typeId === 'AttackHeli' ? 0 : 1); // Air : Front

  const snapshots: SnapshotRow[][] = [];
  const events: WireEvent[][] = [];
  for (let tick = 0; tick < opts.ticks; tick += 1) {
    const frac = opts.ticks > 1 ? tick / (opts.ticks - 1) : 0;
    snapshots.push(
      units.map((u): SnapshotRow => {
        const hull = Math.round(maxHull * (1 - frac));
        return [hull, 0, zoneOf(u), hull > 0 ? 1 : 0];
      }),
    );
    events.push(opts.eventsAt?.[tick] ?? []);
  }

  return {
    formatVersion: opts.formatVersion ?? 1,
    meta: {
      seed: '0x1',
      rulesetHash: 'test',
      tickRate: 10,
      tickCap: 1000,
      matchConfig: { adaptation: 'Locked', defenderSide: 'B', bestOf: 3 },
      unitOrder: units,
      armies: null,
    },
    games: [
      {
        gameResult: { winner: 'A', condition: 'Conquest', rewardTier: 'Full', durationTicks: opts.ticks - 1 },
        snapshots,
        events,
      },
    ],
    result: null,
  };
}
