/**
 * Feature 5 playback state machine (T009/T019/T023/T024). The reducer + pacing math are pure and
 * exported, so the transitions (play/pause/tick halt, O(1) seek clamp, frame-step, game reset) and the
 * `10 × speed` t/s cadence (SC-006) are unit-tested here without React. The rAF loop that *drives*
 * these (timing under fake timers) is exercised by the Playwright/e2e layer.
 */

import { describe, expect, it } from 'vitest';

import {
  drainTicks,
  msPerTickAt,
  playbackReducer,
  type PlayerState,
} from '@/components/battle/use-playback';

const base: PlayerState = { gameIndex: 0, currentTick: 0, isPlaying: false, speed: 1 };
const LAST = 100;

describe('playbackReducer transitions', () => {
  it('play sets isPlaying; play at the end restarts at tick 0 (FR-010)', () => {
    expect(playbackReducer(base, { type: 'play' }, LAST).isPlaying).toBe(true);
    const atEnd = { ...base, currentTick: LAST };
    expect(playbackReducer(atEnd, { type: 'play' }, LAST)).toMatchObject({
      currentTick: 0,
      isPlaying: true,
    });
  });

  it('pause freezes the current tick', () => {
    const s = { ...base, currentTick: 42, isPlaying: true };
    expect(playbackReducer(s, { type: 'pause' }, LAST)).toMatchObject({ currentTick: 42, isPlaying: false });
  });

  it('tick advances by one and HALTS (isPlaying=false) at the last tick (AS2/AS3)', () => {
    const playing = { ...base, currentTick: 5, isPlaying: true };
    expect(playbackReducer(playing, { type: 'tick' }, LAST)).toMatchObject({ currentTick: 6, isPlaying: true });

    const nearEnd = { ...base, currentTick: LAST - 1, isPlaying: true };
    const ended = playbackReducer(nearEnd, { type: 'tick' }, LAST);
    expect(ended.currentTick).toBe(LAST);
    expect(ended.isPlaying).toBe(false); // halts, no overrun/loop
  });
});

describe('seek is O(1): a single clamp, no fast-forward (FR-011, SC-003)', () => {
  it('seek clamps into [0, lastTick] and leaves isPlaying untouched', () => {
    expect(playbackReducer(base, { type: 'seek', tick: 850 }, LAST).currentTick).toBe(100); // clamp hi
    expect(playbackReducer(base, { type: 'seek', tick: -5 }, LAST).currentTick).toBe(0); // clamp lo
    // jump-and-continue while playing / jump-and-stay while paused → isPlaying preserved either way.
    const playing = { ...base, isPlaying: true };
    expect(playbackReducer(playing, { type: 'seek', tick: 40 }, LAST)).toMatchObject({
      currentTick: 40,
      isPlaying: true,
    });
    expect(playbackReducer(base, { type: 'seek', tick: 40 }, LAST)).toMatchObject({
      currentTick: 40,
      isPlaying: false,
    });
  });
});

describe('step + selectGame (FR-014/FR-009)', () => {
  it('step pauses and moves exactly delta, clamped', () => {
    const playing = { ...base, currentTick: 50, isPlaying: true };
    expect(playbackReducer(playing, { type: 'step', delta: 3 }, LAST)).toMatchObject({
      currentTick: 53,
      isPlaying: false,
    });
    expect(playbackReducer(playing, { type: 'step', delta: -100 }, LAST).currentTick).toBe(0); // clamp lo
    expect(playbackReducer({ ...playing, currentTick: 99 }, { type: 'step', delta: 50 }, LAST).currentTick).toBe(
      LAST,
    ); // clamp hi
  });

  it('selectGame resets to that game tick 0, paused', () => {
    const s = { ...base, currentTick: 60, isPlaying: true, gameIndex: 0 };
    expect(playbackReducer(s, { type: 'selectGame', gameIndex: 1 }, LAST)).toMatchObject({
      gameIndex: 1,
      currentTick: 0,
      isPlaying: false,
    });
  });

  it('setSpeed changes only the rate', () => {
    expect(playbackReducer(base, { type: 'setSpeed', speed: 2 }, LAST).speed).toBe(2);
  });
});

describe('pacing math — 10 × speed ticks/sec (SC-006)', () => {
  it('msPerTick = 100/50/200 at 1×/2×/0.5×', () => {
    expect(msPerTickAt(1)).toBe(100);
    expect(msPerTickAt(2)).toBe(50);
    expect(msPerTickAt(0.5)).toBe(200);
  });

  it('drainTicks yields 10/20/5 ticks per 1000 ms at 1×/2×/0.5×', () => {
    expect(drainTicks(1000, msPerTickAt(1)).ticks).toBe(10);
    expect(drainTicks(1000, msPerTickAt(2)).ticks).toBe(20);
    expect(drainTicks(1000, msPerTickAt(0.5)).ticks).toBe(5);
  });

  it('drainTicks carries the sub-tick remainder (no dropped/duplicated ticks)', () => {
    const { ticks, remainder } = drainTicks(250, 100); // 2 ticks + 50ms left over
    expect(ticks).toBe(2);
    expect(remainder).toBe(50);
  });
});
