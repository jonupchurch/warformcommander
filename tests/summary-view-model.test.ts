/**
 * Feature 6 ViewModel (T007-T009/T014-T015/T024) — the SC-001/002/003/005/006 core. Every
 * `MatchResult` field is represented (full-field), win-condition/tier derive correctly, perspective
 * flips verdict + series, totals equal the result with zero drift, per-machine fates key to the right
 * identity, and the standing renders ranked/practice. Pure — no I/O, no engine.
 */

import { describe, expect, it } from 'vitest';

import type { MatchResult } from '@/sim/model';
import type { PerMachineDamage } from '@/lib/battle-summary/mvp';
import { deriveSummaryViewModel, type DeriveContext } from '@/lib/battle-summary/view-model';
import { avgHullLeftPct, milliToWhole, unitsKilled, unitsLost } from '@/lib/battle-summary/format';
import {
  RESULT_BATTERY,
  UNIT_ORDER,
  defeat20,
  exactTieDefender,
  sweep20,
  timeTiebreakWin,
  totalWipe,
  winWithTimeLoss21,
} from '@/lib/battle-summary/__fixtures__/results';

function ctx(over: Partial<DeriveContext> = {}): DeriveContext {
  return {
    viewerSide: 'A',
    unitOrder: UNIT_ORDER,
    tickRate: 10,
    opponent: { name: 'CMDR_RIVAL', href: '/profile/rival', hidden: false },
    replayRef: { matchId: 'm-123' },
    ...over,
  };
}

describe('full-field representation (SC-001)', () => {
  it('represents every MatchResult field for every fixture', () => {
    for (const [name, result] of Object.entries(RESULT_BATTERY) as [string, MatchResult][]) {
      const vm = deriveSummaryViewModel(result, ctx());
      // winner → verdict
      expect(vm.outcome.verdict, name).toBe(result.winner === 'A' ? 'VICTORY' : 'DEFEAT');
      // every game's winner/condition/tier/duration is present in perGame
      expect(vm.perGame, name).toHaveLength(result.games.length);
      result.games.forEach((g, i) => {
        expect(vm.perGame[i]!.condition).toBe(g.condition === 'Conquest' ? 'CONQUEST' : 'TIME');
        expect(vm.perGame[i]!.rewardTier).toBe(g.rewardTier === 'Full' ? 'FULL' : 'LESSER');
        expect(vm.perGame[i]!.durationSeconds).toBe(`${(g.durationTicks / 10).toFixed(1)}s`);
        expect(vm.perGame[i]!.result).toBe(g.winner === 'A' ? 'W' : 'L');
      });
      // every machine fate is represented
      expect(vm.perMachine, name).toHaveLength(result.machineFates.length);
      // side damage totals + survivor-derived counts are present
      expect(vm.totals.damageDealt.viewer, name).toBe(result.sideA.damageDealt);
      expect(vm.totals.damageDealt.opponent, name).toBe(result.sideB.damageDealt);
    }
  });
});

describe('win-condition + reward tier (SC-002)', () => {
  it('Conquest→CONQUEST/FULL, Time→TIME·DMG/LESSER, and a Time-tiebreak win never derives CONQUEST', () => {
    const vm = deriveSummaryViewModel(timeTiebreakWin, ctx());
    expect(vm.perGame[0]).toMatchObject({ condition: 'CONQUEST', rewardTier: 'FULL' });
    const decider = vm.perGame[2]!;
    expect(decider.condition).toBe('TIME');
    expect(decider.conditionDetail).toBe('DMG');
    expect(decider.rewardTier).toBe('LESSER');
    expect(vm.outcome.verdict).toBe('VICTORY');
    // the deciding win is a Time decision, not a Conquest.
    expect(decider.result).toBe('W');
    expect(decider.condition).not.toBe('CONQUEST');
  });

  it('the exact-tie→defender decider is a Time game won by the defender (labelled DMG)', () => {
    // Viewer B is the defender and takes the deciding Time game.
    const vm = deriveSummaryViewModel(exactTieDefender, ctx({ viewerSide: 'B' }));
    expect(vm.outcome.verdict).toBe('VICTORY');
    expect(vm.perGame[2]).toMatchObject({ condition: 'TIME', conditionDetail: 'DMG', result: 'W' });
  });
});

describe('perspective + series (SC-005, FR-003/004)', () => {
  it('flipping viewerSide flips verdict and the series W/L', () => {
    const asA = deriveSummaryViewModel(sweep20, ctx({ viewerSide: 'A' }));
    const asB = deriveSummaryViewModel(sweep20, ctx({ viewerSide: 'B' }));
    expect(asA.outcome.verdict).toBe('VICTORY');
    expect(asB.outcome.verdict).toBe('DEFEAT');
    expect(asA.series.map((s) => s.result)).toEqual(['W', 'W']);
    expect(asB.series.map((s) => s.result)).toEqual(['L', 'L']);
    // and every SidePair swaps
    expect(asA.totals.damageDealt.viewer).toBe(asB.totals.damageDealt.opponent);
  });

  it('a 2-0 yields 2 pips, a 2-1 yields 3; seriesLabel counts wins–losses', () => {
    const sweep = deriveSummaryViewModel(sweep20, ctx());
    expect(sweep.series).toHaveLength(2);
    expect(sweep.outcome.seriesLabel).toBe('2 – 0');

    const twoOne = deriveSummaryViewModel(winWithTimeLoss21, ctx());
    expect(twoOne.series).toHaveLength(3);
    expect(twoOne.series.map((s) => s.result)).toEqual(['W', 'L', 'W']);
    expect(twoOne.outcome.seriesLabel).toBe('2 – 1');
    expect(deriveSummaryViewModel(defeat20, ctx()).outcome.seriesLabel).toBe('0 – 2');
  });
});

describe('totals equality — zero drift (SC-003, FR-008)', () => {
  it('damageDealt deep-equals the result side totals (raw milli-units)', () => {
    const vm = deriveSummaryViewModel(winWithTimeLoss21, ctx());
    expect(vm.totals.damageDealt).toEqual({
      viewer: winWithTimeLoss21.sideA.damageDealt,
      opponent: winWithTimeLoss21.sideB.damageDealt,
    });
  });

  it('unitsKilled/unitsLost are exact functions of survivor counts', () => {
    const vm = deriveSummaryViewModel(sweep20, ctx());
    // A kept 4, wiped B (0 survivors) → killed 5, lost 1.
    expect(vm.totals.unitsKilled).toEqual({ viewer: unitsKilled(0), opponent: unitsKilled(4) });
    expect(vm.totals.unitsLost).toEqual({ viewer: unitsLost(4), opponent: unitsLost(0) });
    expect(vm.totals.unitsKilled.viewer).toBe(5);
    expect(vm.totals.unitsLost.viewer).toBe(1);
  });

  it('avg hull is 0% on a total wipe of the viewer', () => {
    const vm = deriveSummaryViewModel(totalWipe, ctx());
    expect(vm.totals.avgHullLeft.viewer).toBe(0);
    expect(vm.totals.avgHullLeft.viewer).toBe(avgHullLeftPct(totalWipe.machineFates, 'A'));
    expect(vm.totals.avgHullLeft.opponent).toBeGreaterThan(0);
  });
});

describe('per-machine fates (FR-009)', () => {
  it('each machine maps to destroyed@tick / survived@hull% keyed to the right identity', () => {
    const vm = deriveSummaryViewModel(sweep20, ctx());
    // A's Artillery (instanceId 3) was destroyed at tick 74 → 7.4s.
    const arty = vm.perMachine.find((m) => m.variant === 'Longbow')!;
    expect(arty.side).toBe('viewer');
    expect(arty.fate).toEqual({ kind: 'destroyed', atTick: 74, atSeconds: '7.4s' });
    // A's HeavyTank (instanceId 0) survived at 52% (5200 bp).
    const grizzly = vm.perMachine.find((m) => m.variant === 'Grizzly')!;
    expect(grizzly.fate).toEqual({ kind: 'survived', hullPct: 52 });
    expect(grizzly.typeKey).toBe('heavytank');
  });

  it('destroyed-at-tick-0 and survived-at-100% extremes render', () => {
    const result: MatchResult = {
      ...sweep20,
      machineFates: [
        { unit: { side: 'A', instanceId: 0 }, fate: { destroyedAtTick: 0 } },
        { unit: { side: 'A', instanceId: 1 }, fate: { survivedWithHullPct: 10000 } },
      ],
    };
    const vm = deriveSummaryViewModel(result, ctx());
    expect(vm.perMachine[0]!.fate).toMatchObject({ kind: 'destroyed', atTick: 0, atSeconds: '0.0s' });
    expect(vm.perMachine[1]!.fate).toMatchObject({ kind: 'survived', hullPct: 100 });
  });
});

describe('standing — ranked / practice (SC-006, FR-011/017)', () => {
  it('a ranked win → +1 NET VICTORY with before/after', () => {
    const vm = deriveSummaryViewModel(
      sweep20,
      ctx({ standing: { mode: 'ranked', delta: 1, before: 47, after: 48 } }),
    );
    expect(vm.standing).toEqual({
      mode: 'ranked',
      delta: 1,
      before: 47,
      after: 48,
      label: '+1 NET VICTORY',
    });
  });

  it('an attack loss does not decrease net victories (delta 0 → NO CHANGE)', () => {
    const vm = deriveSummaryViewModel(defeat20, ctx({ standing: { mode: 'ranked', delta: 0, before: 47, after: 47 } }));
    expect(vm.standing).toMatchObject({ mode: 'ranked', delta: 0, label: 'NO CHANGE' });
  });

  it('a practice match → UNRANKED, no delta, opponent hidden', () => {
    const vm = deriveSummaryViewModel(
      sweep20,
      ctx({ standing: { mode: 'practice' }, opponent: { name: 'SECRET', hidden: true } }),
    );
    expect(vm.standing).toEqual({ mode: 'practice', label: 'UNRANKED' });
    expect(vm.outcome.opponent.hidden).toBe(true);
    expect(vm.outcome.opponent.name).toBeUndefined();
  });

  it('omits the standing entirely when none is provided', () => {
    expect(deriveSummaryViewModel(sweep20, ctx()).standing).toBeUndefined();
  });
});

describe('mvp — present iff per-machine damage provided (FR-010)', () => {
  it('omits mvp with no per-machine damage; emits the top damage dealer when provided', () => {
    expect(deriveSummaryViewModel(sweep20, ctx()).mvp).toBeUndefined();

    const damage: PerMachineDamage[] = [
      { column: 0, side: 'A', damageDealt: 3_410_000, damageAbsorbed: 5_880_000, kills: 4 },
      { column: 1, side: 'A', damageDealt: 1_200_000, damageAbsorbed: 900_000, kills: 1 },
    ];
    const vm = deriveSummaryViewModel(sweep20, ctx({ perMachineDamage: damage }));
    expect(vm.mvp).toEqual({
      typeKey: 'heavytank',
      variant: 'Grizzly',
      side: 'viewer',
      damageDealt: 3410,
      kills: 4,
      damageAbsorbed: 5880,
    });
  });
});

describe('actions — the loop-closing hrefs (US3)', () => {
  it('watch-replay targets the Feature 5 battle route for this match; next/back target the arena', () => {
    const vm = deriveSummaryViewModel(sweep20, ctx({ replayRef: { matchId: 'abc' } }));
    expect(vm.actions.watchReplayHref).toBe('/battle/abc');
    expect(vm.actions.findNextOpponentHref).toBe('/arena');
    expect(vm.actions.backHref).toBe('/arena');
  });
});

describe('perGame survivors passthrough', () => {
  it('surfaces per-game survivor counts when provided by ctx', () => {
    const vm = deriveSummaryViewModel(
      winWithTimeLoss21,
      ctx({ perGameSurvivors: [{ viewer: 4, opponent: 0 }, { viewer: 1, opponent: 4 }, { viewer: 3, opponent: 0 }] }),
    );
    expect(vm.perGame.map((g) => g.survivors)).toEqual([
      { viewer: 4, opponent: 0 },
      { viewer: 1, opponent: 4 },
      { viewer: 3, opponent: 0 },
    ]);
    expect(milliToWhole(1_000)).toBe(1); // format sanity
  });
});
