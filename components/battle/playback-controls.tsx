'use client';

/**
 * `PlaybackControls` (Feature 5, T026) — the transport cluster (mockup): jump-to-start, frame-step
 * ◄◄, play/pause, frame-step ►►, jump-to-end, a 0.5×/1×/2× speed toggle, and "Skip to Outcome →".
 * Every control is a Feature 3 {@link Button} (keyboard-operable, visible focus); pure — it only
 * calls the dispatchers `BattlePlayer` binds to `usePlayback`. Space/`K` play-toggle lives on the
 * player region (BattlePlayer) so it works regardless of which control has focus (research C2).
 */

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Speed } from './use-playback';

const SPEEDS: readonly Speed[] = [0.5, 1, 2];

export interface PlaybackControlsProps {
  isPlaying: boolean;
  speed: Speed;
  atEnd: boolean;
  onToggle(): void;
  onStep(delta: number): void;
  onJumpStart(): void;
  onJumpEnd(): void;
  onSetSpeed(speed: Speed): void;
  /** "Skip to Outcome" → Feature 6, when present. */
  summaryHref?: string;
  className?: string;
}

export function PlaybackControls({
  isPlaying,
  speed,
  atEnd,
  onToggle,
  onStep,
  onJumpStart,
  onJumpEnd,
  onSetSpeed,
  summaryHref,
  className,
}: PlaybackControlsProps) {
  return (
    <div data-slot="playback-controls" className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="secondary" size="sm" onClick={onJumpStart} aria-label="Jump to start">
          ⏮
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => onStep(-1)} aria-label="Step back one tick">
          ◄◄
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onToggle}
          aria-label={isPlaying ? 'Pause' : atEnd ? 'Replay from start' : 'Play'}
          className="min-w-12"
        >
          {isPlaying ? '❚❚' : atEnd ? '↺' : '▶'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => onStep(1)} aria-label="Step forward one tick">
          ►►
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onJumpEnd} aria-label="Jump to end">
          ⏭
        </Button>
      </div>

      <div
        role="group"
        aria-label="Playback speed"
        className="ml-1 flex items-center gap-1 rounded-md border border-border p-0.5"
      >
        {SPEEDS.map((s) => (
          <Button
            key={s}
            type="button"
            variant={s === speed ? 'primary' : 'ghost'}
            size="sm"
            aria-pressed={s === speed}
            onClick={() => onSetSpeed(s)}
          >
            {s}×
          </Button>
        ))}
      </div>

      {summaryHref && (
        <Button asChild variant="secondary" size="sm" className="ml-auto">
          <a href={summaryHref}>Skip to Outcome →</a>
        </Button>
      )}
    </div>
  );
}
