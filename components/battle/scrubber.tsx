'use client';

/**
 * `Scrubber` (Feature 5, T021) — **the headline fix**: a WAI-ARIA media-seek slider over the replay
 * timeline. Every value change is **one O(1) seek** (`onSeek(tick)` → `snapshotAt(tick)`); it never
 * re-simulates — the anti-regression for the previous game's broken viewer (P6, SC-003/SC-005).
 *
 * Built on a native `<input type="range">` so pointer drag / click-on-track and the core keyboard
 * model come for free and accessibly: `role="slider"` + `aria-valuenow/min/max` are implicit from
 * `value/min/max`, augmented with a human-readable `aria-valuetext` ("tick 412 of 1000, 41.2
 * seconds"). Arrow/Home/End move ±1/0/last natively; **PageUp/PageDown are overridden to ±10** (the
 * native "big step" is a fraction of the range, not 10 ticks). The thumb + fill are the
 * `--faction-friendly` token via `accent-color`; visible focus ring is the Feature 3 `--ring`.
 *
 * `TimelineMarkers` (US4) overlays Plan-B/death annotations on the track; the slider owns seek.
 */

import type { TimelineMarker } from '@/sim/replay-view';
import { cn } from '@/lib/utils';
import { TimelineMarkers } from './timeline-markers';

export interface ScrubberProps {
  currentTick: number;
  lastTick: number;
  /** ticks/second, for the `aria-valuetext` seconds readout. */
  tickRate: number;
  onSeek(tick: number): void;
  /** memoized per-game event markers (US4); omitted → no overlay. */
  markers?: TimelineMarker[];
  className?: string;
}

export function Scrubber({ currentTick, lastTick, tickRate, onSeek, markers, className }: ScrubberProps) {
  const clamp = (t: number) => Math.min(lastTick, Math.max(0, t));
  const seconds = (currentTick / (tickRate || 10)).toFixed(1);
  const valueText = `tick ${currentTick} of ${lastTick}, ${seconds} seconds`;

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Enforce the media-player big-step (±10); leave Arrow/Home/End to the native slider (step 1).
    if (event.key === 'PageUp') {
      event.preventDefault();
      onSeek(clamp(currentTick + 10));
    } else if (event.key === 'PageDown') {
      event.preventDefault();
      onSeek(clamp(currentTick - 10));
    }
  }

  return (
    <div className={cn('relative flex items-center', className)}>
      <input
        type="range"
        min={0}
        max={lastTick}
        step={1}
        value={currentTick}
        onChange={(event) => onSeek(clamp(Number(event.target.value)))}
        onKeyDown={onKeyDown}
        aria-label="Battle timeline"
        aria-valuetext={valueText}
        className={cn(
          'h-2 w-full cursor-pointer appearance-none rounded-full bg-track accent-faction-friendly',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        )}
      />
      {markers && <TimelineMarkers markers={markers} onSeek={onSeek} />}
    </div>
  );
}
