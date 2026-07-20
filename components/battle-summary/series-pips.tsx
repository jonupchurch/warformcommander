/**
 * `SeriesPips` (Feature 6, T010) — the per-game W/L pills (G1/G2/G3) from `vm.series`. Win = the
 * friendly cyan, loss = the enemy tint, conveyed by **color plus the W/L glyph** (never color alone —
 * FR-016) and an accessible per-game label. Pure render; token-only.
 */

import { cn } from '@/lib/utils';

export interface SeriesPipsProps {
  series: { game: number; result: 'W' | 'L' }[];
  className?: string;
}

export function SeriesPips({ series, className }: SeriesPipsProps) {
  return (
    <div className={cn('flex items-center gap-2', className)} role="list" aria-label="Series result by game">
      {series.map((s) => (
        <div
          key={s.game}
          role="listitem"
          aria-label={`Game ${s.game}: ${s.result === 'W' ? 'Win' : 'Loss'}`}
          className={cn(
            'flex size-11 items-center justify-center rounded-lg font-display text-lg font-extrabold',
            s.result === 'W'
              ? 'bg-faction-friendly text-void'
              : 'border border-faction-enemy/40 bg-faction-enemy-soft text-faction-enemy',
          )}
        >
          {s.result}
        </div>
      ))}
    </div>
  );
}
