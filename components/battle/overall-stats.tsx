/**
 * `OverallStats` (Feature 5, T015) — the per-side readout strip above the battlefield (FR-008):
 * each side's alive `n/total`, summed current hull, and damage dealt, with the game/tick readout in
 * the center. Pure render of the two {@link SideStats} the current-tick projection produced — no
 * state, no derivation here beyond formatting. Token-only (friendly cyan / enemy red).
 */

import type { SideStats } from '@/sim/replay-view';
import { cn } from '@/lib/utils';

export interface OverallStatsProps {
  player: SideStats;
  enemy: SideStats;
  /** e.g. "42 / 144" */
  tickStr: string;
  /** e.g. "4.2s" */
  timeStr: string;
  /** e.g. "GAME 1 / 2" */
  gameLabel: string;
  className?: string;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'friendly' | 'enemy' }) {
  return (
    <span className="type-readout whitespace-nowrap text-xs text-text-muted">
      {label}{' '}
      <span
        className={cn(
          'font-bold',
          tone === 'friendly' ? 'text-faction-friendly' : tone === 'enemy' ? 'text-faction-enemy' : 'text-text-strong',
        )}
      >
        {value}
      </span>
    </span>
  );
}

export function OverallStats({ player, enemy, tickStr, timeStr, gameLabel, className }: OverallStatsProps) {
  return (
    <div
      data-slot="overall-stats"
      className={cn(
        'grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-border bg-surface-rail px-3 py-2.5 sm:px-5',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        <span className="type-eyebrow text-[0.625rem] text-faction-friendly">◤ YOUR FORCES</span>
        <Metric label="ALIVE" value={`${player.alive}/${player.total}`} />
        <Metric label="HULL" value={player.hull.toLocaleString()} />
        <Metric label="DMG" value={player.damageDealt.toLocaleString()} tone="friendly" />
      </div>

      <div className="flex flex-col items-center gap-0.5 px-2 text-center">
        <span className="type-readout text-[0.625rem] text-text-dim">{gameLabel}</span>
        <span className="type-label text-sm text-text-strong">TICK {tickStr}</span>
        <span className="type-readout text-[0.625rem] text-text-muted">{timeStr}</span>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-1">
        <Metric label="DMG" value={enemy.damageDealt.toLocaleString()} tone="enemy" />
        <Metric label="HULL" value={enemy.hull.toLocaleString()} />
        <Metric label="ALIVE" value={`${enemy.alive}/${enemy.total}`} />
        <span className="type-eyebrow text-[0.625rem] text-faction-enemy">ENEMY ◥</span>
      </div>
    </div>
  );
}
