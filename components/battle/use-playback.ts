'use client';

/**
 * The playback state machine + rAF loop (Feature 5, T008) — the P6 spine on the client side. The
 * reducer ({@link playbackReducer}) and the pacing math ({@link drainTicks}) are **pure and exported**
 * so they're unit-testable without React (SC-006). The `requestAnimationFrame` loop maps elapsed
 * wall-clock time to **integer ticks** at `10 × speed` t/s via an accumulator, dispatches **only**
 * `tick`, halts at `lastTick`, and is torn down on pause/unmount.
 *
 * **Seek is O(1) and independent of the loop** — a single clamp + dispatch; the render indexes
 * `snapshotAt(tick)` (in `replay-view.ts`). Nothing here imports or calls the engine
 * (`@wfc/engine-wasm`) — the anti-regression for the previous game's broken viewer (SC-005).
 */

import { useCallback, useEffect, useMemo, useReducer } from 'react';

import type { ReplayView } from '@/sim/replay-view';

export type Speed = 0.5 | 1 | 2;

export interface PlayerState {
  gameIndex: number;
  currentTick: number;
  isPlaying: boolean;
  speed: Speed;
}

export type PlaybackAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'tick' }
  | { type: 'seek'; tick: number }
  | { type: 'step'; delta: number }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'selectGame'; gameIndex: number };

export interface PlaybackApi extends PlayerState {
  lastTick: number;
  atEnd: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(tick: number): void;
  step(delta: number): void;
  setSpeed(speed: Speed): void;
  selectGame(gameIndex: number): void;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * The pure transition. `lastTick` is the current game's last index (passed in so the reducer stays a
 * pure function, not closed over the view). Guarantees per data-model Tier 2:
 * - `tick` advances by one and **halts** (`isPlaying=false`) on reaching `lastTick` (FR-010).
 * - `seek` is a single clamp — no fast-forward, no engine call (FR-011).
 * - `step` pauses then seeks (frame-step, FR-014); `selectGame` resets to tick 0 (FR-009).
 */
export function playbackReducer(
  state: PlayerState,
  action: PlaybackAction,
  lastTick: number,
): PlayerState {
  switch (action.type) {
    case 'play':
      // Replaying from the end restarts at tick 0 (data-model: play when atEnd resets first).
      return state.currentTick >= lastTick
        ? { ...state, currentTick: 0, isPlaying: true }
        : { ...state, isPlaying: true };
    case 'pause':
      return { ...state, isPlaying: false };
    case 'tick': {
      const next = Math.min(state.currentTick + 1, lastTick);
      return { ...state, currentTick: next, isPlaying: next >= lastTick ? false : state.isPlaying };
    }
    case 'seek':
      return { ...state, currentTick: clamp(action.tick, 0, lastTick) };
    case 'step':
      return { ...state, isPlaying: false, currentTick: clamp(state.currentTick + action.delta, 0, lastTick) };
    case 'setSpeed':
      return { ...state, speed: action.speed };
    case 'selectGame':
      return { ...state, gameIndex: action.gameIndex, currentTick: 0, isPlaying: false };
    default:
      return state;
  }
}

/** Drain whole ticks from an accumulator: `{ ticks, remainder }` where `ticks = ⌊acc / msPerTick⌋`. */
export function drainTicks(accMs: number, msPerTick: number): { ticks: number; remainder: number } {
  if (msPerTick <= 0) return { ticks: 0, remainder: accMs };
  const ticks = Math.floor(accMs / msPerTick);
  return { ticks, remainder: accMs - ticks * msPerTick };
}

/** ms of wall-clock per tick at a given speed (10 t/s base → 100 ms; 2× → 50 ms; 0.5× → 200 ms). */
export function msPerTickAt(speed: Speed): number {
  return 100 / speed;
}

/**
 * Own the reducer + the ref-held rAF accumulator loop. The loop runs only while `isPlaying`, advances
 * integer ticks at `10 × speed` t/s, and is cleaned up on pause/unmount. `seek`/`step` are synchronous
 * and O(1), independent of the loop (work while paused or playing — jump-and-continue / jump-and-stay).
 */
export function usePlayback(view: ReplayView, opts?: { initialGame?: number }): PlaybackApi {
  const initialGame = opts?.initialGame ?? 0;
  const reducer = useCallback(
    (state: PlayerState, action: PlaybackAction) =>
      playbackReducer(state, action, view.lastTick(state.gameIndex)),
    [view],
  );
  const [state, dispatch] = useReducer(reducer, {
    gameIndex: initialGame,
    currentTick: 0,
    isPlaying: false,
    speed: 1,
  });

  const lastTick = view.lastTick(state.gameIndex);
  const atEnd = state.currentTick >= lastTick;

  // The rAF loop lives outside the reducer — started/stopped by this effect, dispatches only `tick`.
  useEffect(() => {
    if (!state.isPlaying) return;
    const msPerTick = msPerTickAt(state.speed);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      acc += now - last;
      last = now;
      const { ticks, remainder } = drainTicks(acc, msPerTick);
      acc = remainder;
      for (let i = 0; i < ticks; i += 1) dispatch({ type: 'tick' });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // gameIndex is included so a game switch restarts the loop cleanly against the new lastTick.
  }, [state.isPlaying, state.speed, state.gameIndex]);

  return useMemo<PlaybackApi>(
    () => ({
      ...state,
      lastTick,
      atEnd,
      play: () => dispatch({ type: 'play' }),
      pause: () => dispatch({ type: 'pause' }),
      toggle: () => dispatch(state.isPlaying ? { type: 'pause' } : { type: 'play' }),
      seek: (tick: number) => dispatch({ type: 'seek', tick }),
      step: (delta: number) => dispatch({ type: 'step', delta }),
      setSpeed: (speed: Speed) => dispatch({ type: 'setSpeed', speed }),
      selectGame: (gameIndex: number) => dispatch({ type: 'selectGame', gameIndex }),
    }),
    [state, lastTick, atEnd],
  );
}
