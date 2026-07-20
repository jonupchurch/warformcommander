/**
 * `GameBreakdown` (Feature 6, T012) — the per-game cards from `vm.perGame`: a W/L badge, `GAME N`, the
 * win condition (`CONQUEST` cyan / `TIME · DMG` enemy — distinct in **text and color**, SC-002), the
 * reward tier (`FULL`/`LESSER`), survivors (`4 vs 0`) when known, and the duration (`8.2s`). Pure
 * render; Feature 3 `Chip` + tokens.
 */

import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/utils';
import type { BattleSummaryViewModel } from '@/lib/battle-summary/view-model';

export interface GameBreakdownProps {
  perGame: BattleSummaryViewModel['perGame'];
  className?: string;
}

function Badge({ result }: { result: 'W' | 'L' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-lg font-display text-sm font-extrabold',
        result === 'W'
          ? 'bg-faction-friendly text-void'
          : 'border border-faction-enemy/40 bg-faction-enemy-soft text-faction-enemy',
      )}
    >
      {result}
    </span>
  );
}

export function GameBreakdown({ perGame, className }: GameBreakdownProps) {
  return (
    <ol className={cn('flex flex-col gap-3', className)}>
      {perGame.map((g) => {
        const conquest = g.condition === 'CONQUEST';
        const conditionText = conquest ? 'CONQUEST' : `TIME${g.conditionDetail ? ` · ${g.conditionDetail}` : ''}`;
        return (
          <li
            key={g.game}
            className={cn(
              'flex flex-wrap items-center gap-4 rounded-xl border bg-surface-rail px-4 py-3.5',
              g.result === 'W' ? 'border-faction-friendly/20' : 'border-faction-enemy/20',
            )}
            aria-label={`Game ${g.game}: ${g.result === 'W' ? 'Win' : 'Loss'}, ${conditionText}, ${g.rewardTier} reward, ${g.durationSeconds}${g.survivors ? `, survivors ${g.survivors.viewer} versus ${g.survivors.opponent}` : ''}`}
          >
            <Badge result={g.result} />

            <div className="flex min-w-24 flex-col gap-0.5">
              <span className="type-label text-sm text-text-strong">GAME {g.game}</span>
              <span className={cn('type-readout text-xs', conquest ? 'text-faction-friendly' : 'text-faction-enemy')}>
                {conditionText}
              </span>
            </div>

            <Chip className="shrink-0">{g.rewardTier}</Chip>

            {g.survivors && (
              <div aria-hidden className="flex flex-col gap-0.5">
                <span className="type-eyebrow text-[0.625rem] text-text-muted">SURVIVORS</span>
                <span className="type-readout text-xs text-text">
                  {g.survivors.viewer} <span className="text-text-muted">vs</span> {g.survivors.opponent}
                </span>
              </div>
            )}

            <span className="type-readout ml-auto text-xs text-text-muted tabular-nums">{g.durationSeconds}</span>
          </li>
        );
      })}
    </ol>
  );
}
