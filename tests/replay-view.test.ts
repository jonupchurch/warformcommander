/**
 * Feature 5 reader-extension (T010/T017/T018/T028). The load-bearing checks: `buildViewModel` is
 * frame-accurate against the raw snapshot (SC-001), seeking is **O(1)** — a last-tick seek touches the
 * same bounded reads as a tick-1 seek (SC-003) — the module **never imports the engine** (SC-005), and
 * `deriveMarkers` collects planb/death in one memoized pass (FR-015).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseReplay, SCALE, UnsupportedFormatError, ZONE_NAMES } from '@/sim/replay-reader';
import { createReplayView } from '@/sim/replay-view';

import { loadBatteryReplay, makeSyntheticReplay } from './replay-fixtures';

describe('createReplayView — basics + graceful reject', () => {
  it('exposes games/ticks and rejects an unsupported formatVersion (FR-003/SC-007)', () => {
    const view = createReplayView(loadBatteryReplay(), 'A');
    expect(view.gamesCount).toBe(2);
    expect(view.lastTick(0)).toBe(144); // 145 ticks → last index 144
    expect(view.tickRate).toBe(10);

    expect(() => createReplayView(makeSyntheticReplay({ ticks: 5, formatVersion: 99 }), 'A')).toThrow(
      UnsupportedFormatError,
    );
  });

  it('a tiny (2-tick) battle has no divide-by-zero on progress/markers (SC-010)', () => {
    const view = createReplayView(makeSyntheticReplay({ ticks: 2 }), 'A');
    expect(view.lastTick(0)).toBe(1);
    expect(view.buildViewModel(0, 0).progress).toBe(0);
    expect(Number.isFinite(view.buildViewModel(0, 1).progress)).toBe(true);
  });
});

describe('buildViewModel is frame-accurate against the raw snapshot (SC-001)', () => {
  const replay = loadBatteryReplay();
  const view = createReplayView(replay, 'A');

  it('every unit hull/shield/zone/alive at a sweep of ticks equals snapshotAt(g,t)', () => {
    const last = view.lastTick(0);
    for (const tick of [0, 1, 37, 88, last]) {
      const rows = view.snapshotAt(0, tick);
      const vm = view.buildViewModel(0, tick);
      const allUnits = [
        ...vm.player.air,
        ...vm.player.ground.flatMap((z) => z.units),
        ...vm.enemy.air,
        ...vm.enemy.ground.flatMap((z) => z.units),
      ];
      expect(allUnits).toHaveLength(rows.length); // no unit dropped
      for (const u of allUnits) {
        const [hull, shield, zoneIdx, alive] = rows[u.column]!;
        expect(u.hull).toBeCloseTo(hull / SCALE, 6);
        expect(u.shield).toBeCloseTo(shield / SCALE, 6);
        expect(u.zone).toBe(ZONE_NAMES[zoneIdx]);
        expect(u.alive).toBe(alive !== 0);
      }
    }
  });

  it('player Fronts and enemy Fronts are ordered toward the contact line (§4)', () => {
    const vm = view.buildViewModel(0, 0);
    expect(vm.player.ground.map((z) => z.zone)).toEqual(['Rear', 'Middle', 'Front']);
    expect(vm.enemy.ground.map((z) => z.zone)).toEqual(['Front', 'Middle', 'Rear']);
  });

  it('faction tint follows playerSide', () => {
    const asA = createReplayView(replay, 'A').buildViewModel(0, 0);
    const asB = createReplayView(replay, 'B').buildViewModel(0, 0);
    // The same A-side unit is friendly for viewer A and enemy for viewer B.
    expect(asA.player.ground.flatMap((z) => z.units).every((u) => u.side === 'A')).toBe(true);
    expect(asB.enemy.ground.flatMap((z) => z.units).every((u) => u.side === 'A')).toBe(true);
  });

  it('hullPct is measured against the tick-0 baseline (full at tick 0, ≤1 after)', () => {
    const vm0 = view.buildViewModel(0, 0);
    for (const u of vm0.player.ground.flatMap((z) => z.units)) {
      expect(u.hullPct).toBeCloseTo(1, 6); // tick 0 = full
    }
    const vmLast = view.buildViewModel(0, view.lastTick(0));
    for (const u of [...vmLast.player.ground.flatMap((z) => z.units)]) {
      expect(u.hullPct).toBeLessThanOrEqual(1);
      expect(u.hullPct).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('seek is O(1), not O(tick) (SC-003)', () => {
  it('a last-tick seek touches the same bounded reads as a tick-1 seek', () => {
    const replay = makeSyntheticReplay({ ticks: 1000 });
    const reader = parseReplay(replay);
    let reads = 0;
    const orig = reader.snapshotAt.bind(reader);
    reader.snapshotAt = (g: number, t: number) => {
      reads += 1;
      return orig(g, t);
    };
    const view = createReplayView(reader, 'A');

    reads = 0;
    view.snapshotAt(0, 1);
    const readsAtStart = reads;
    reads = 0;
    view.snapshotAt(0, 999);
    const readsAtEnd = reads;
    expect(readsAtStart).toBe(1); // one direct index
    expect(readsAtEnd).toBe(readsAtStart); // NOT O(tick)

    // The full projection is likewise constant-cost regardless of target-tick magnitude.
    reads = 0;
    view.buildViewModel(0, 1);
    const vmReadsStart = reads;
    reads = 0;
    view.buildViewModel(0, 999);
    expect(reads).toBe(vmReadsStart);
  });
});

describe('the playback surface never imports the engine (SC-005, anti-regression)', () => {
  // The whole surface, not just the two foundational files: the reader extension + every playback
  // component. Seek must stay an array index; nothing here may reach the wasm engine (P6). This is
  // the load-bearing anti-regression for the previous game's broken viewer — never weaken it.
  const battleDir = join(process.cwd(), 'components', 'battle');
  const playbackModules = [
    'sim/replay-view.ts',
    ...readdirSync(battleDir)
      .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'))
      .map((f) => join('components', 'battle', f)),
  ];

  it.each(playbackModules)('%s has no @wfc/engine-wasm / sim engine import', (rel) => {
    // Match import/require *specifiers* — not prose in a doc comment (which legitimately names the
    // module it promises never to import).
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    expect(src).not.toMatch(/from\s+['"]@wfc\/engine-wasm['"]/);
    expect(src).not.toMatch(/require\(\s*['"]@wfc\/engine-wasm['"]/);
    expect(src).not.toMatch(/from\s+['"][@./\w-]*\/sim\/engine['"]/); // the wasm loader
    expect(src).not.toMatch(/from\s+['"]@\/sim['"]/); // the wasm boundary barrel
  });
});

describe('deriveMarkers — one memoized pass (FR-015)', () => {
  it('collects death markers from the real battery with correct tick/side', () => {
    const view = createReplayView(loadBatteryReplay(), 'A');
    const markers = view.deriveMarkers(0);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((m) => m.kind === 'death')).toBe(true); // battery has deaths, no planb
    for (const m of markers) {
      expect(m.tick).toBeGreaterThanOrEqual(0);
      expect(m.tick).toBeLessThanOrEqual(view.lastTick(0));
      expect(m.position).toBeCloseTo(m.tick / view.lastTick(0), 6);
      expect(['friendly', 'enemy']).toContain(m.side);
      expect(m.label).toMatch(/down — tick/);
    }
  });

  it('collects planb markers and is referentially memoized', () => {
    const replay = makeSyntheticReplay({
      ticks: 20,
      eventsAt: {
        5: [{ t: 'planb', u: 0, slot: 'Slot1', dial: 'Energy' }],
        12: [{ t: 'death', u: 2, k: 0 }],
      },
    });
    const view = createReplayView(replay, 'A');
    const markers = view.deriveMarkers(0);
    expect(markers.map((m) => [m.tick, m.kind])).toEqual([
      [5, 'planb'],
      [12, 'death'],
    ]);
    expect(markers.find((m) => m.kind === 'planb')!.label).toMatch(/Plan B triggered/);
    expect(view.deriveMarkers(0)).toBe(markers); // memoized — same array reference
  });
});
