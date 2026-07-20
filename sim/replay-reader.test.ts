/**
 * Tests for the pure replay reader (US5, T047). Uses Node's built-in test runner (`node:test`,
 * zero deps) so it typechecks under `npm run typecheck` today and runs under `node --test` (via tsx)
 * or vitest once a runner is wired with the Feature 5 web-test setup. The Rust side (tests/replay.rs)
 * proves the wire format reconstructs engine state; this proves the reader parses, gates, and seeks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ReplayReader,
  UnsupportedFormatError,
  decodeFrame,
  isSupported,
  parseReplay,
  type WireReplay,
} from './replay-reader';

/** A hand-built two-unit, two-tick wire replay (the shape `to_wire` emits). */
function sampleReplay(formatVersion = 1): WireReplay {
  return {
    formatVersion,
    meta: {
      seed: '12345678901234567890',
      rulesetHash: 'abc123',
      tickRate: 10,
      tickCap: 1000,
      matchConfig: { adaptation: 'Locked', defenderSide: 'B', bestOf: 3 },
      unitOrder: [
        { side: 'A', instanceId: 0, typeId: 'HeavyTank', variantId: 'Grizzly' },
        { side: 'B', instanceId: 0, typeId: 'LightTank', variantId: 'Scout' },
      ],
      armies: null,
    },
    games: [
      {
        gameResult: { winner: 'A', condition: 'Conquest', rewardTier: 'Full', durationTicks: 2 },
        snapshots: [
          [
            [1_700_000, 0, 1, 1],
            [650_000, 0, 1, 1],
          ],
          [
            [1_700_000, 0, 1, 1],
            [0, 0, 1, 0],
          ],
        ],
        events: [
          [{ t: 'shot', a: 0, d: 1 }, { t: 'hit', a: 0, d: 1, dmg: 650_000, layer: 'Hull', crit: false, splash: false }],
          [{ t: 'death', u: 1, k: 0 }],
        ],
      },
    ],
    result: null,
  };
}

test('isSupported gates the version range', () => {
  assert.equal(isSupported(1), true);
  assert.equal(isSupported(0), false);
  assert.equal(isSupported(9999), false);
});

test('parseReplay accepts a supported replay (object or JSON string)', () => {
  const fromObj = parseReplay(sampleReplay());
  assert.ok(fromObj instanceof ReplayReader);
  const fromJson = parseReplay(JSON.stringify(sampleReplay()));
  assert.equal(fromJson.formatVersion, 1);
});

test('parseReplay rejects an unsupported formatVersion', () => {
  assert.throws(() => parseReplay(sampleReplay(2)), UnsupportedFormatError);
});

test('parseReplay rejects a structurally-invalid blob', () => {
  assert.throws(() => parseReplay('null'), TypeError);
  assert.throws(() => parseReplay({ formatVersion: 1 }), TypeError);
});

test('seeks any tick in O(1) without touching prior ticks', () => {
  const reader = parseReplay(sampleReplay());
  // Jump straight to the last tick — no reconstruction from earlier ticks.
  const row = reader.rowOf(0, 1, 1); // game 0, tick 1, unit column 1 (the Scout)
  assert.deepEqual(row, [0, 0, 1, 0]);
  assert.equal(reader.tickCount(0), 2);
  assert.deepEqual(reader.eventsAt(0, 1), [{ t: 'death', u: 1, k: 0 }]);
});

test('decodes a positional row into a display frame', () => {
  const reader = parseReplay(sampleReplay());
  const frame = reader.frameAt(0, 0)[0];
  assert.equal(frame.unit.typeId, 'HeavyTank');
  assert.equal(frame.hull, 1700); // 1_700_000 milli / 1000
  assert.equal(frame.zone, 'Front');
  assert.equal(frame.alive, true);

  const dead = decodeFrame(reader.unitOrder[1]!, reader.rowOf(0, 1, 1));
  assert.equal(dead.alive, false);
  assert.equal(dead.hull, 0);
});

test('out-of-range seeks throw', () => {
  const reader = parseReplay(sampleReplay());
  assert.throws(() => reader.snapshotAt(0, 99), RangeError);
  assert.throws(() => reader.rowOf(0, 0, 5), RangeError);
});
