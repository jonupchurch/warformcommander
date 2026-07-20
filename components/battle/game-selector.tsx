'use client';

/**
 * `GameSelector` (Feature 5, T035) — GAME 1/2/3 tabs for a Bo3 replay (only the games actually
 * present). Selecting a game resets playback to that game's tick 0 (wired via `usePlayback.selectGame`
 * in `BattlePlayer`; FR-009, AS5). A single-game replay renders nothing. Feature 3 `Button`s; the
 * active game is `aria-pressed`. Token-only.
 */

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface GameSelectorProps {
  count: number;
  active: number;
  onSelect(gameIndex: number): void;
  className?: string;
}

export function GameSelector({ count, active, onSelect, className }: GameSelectorProps) {
  if (count <= 1) return null;
  return (
    <div
      role="group"
      aria-label="Select game"
      className={cn('flex items-center gap-1 rounded-lg border border-border p-1', className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <Button
          key={i}
          type="button"
          size="sm"
          variant={i === active ? 'primary' : 'ghost'}
          aria-pressed={i === active}
          onClick={() => onSelect(i)}
        >
          GAME {i + 1}
        </Button>
      ))}
    </div>
  );
}
