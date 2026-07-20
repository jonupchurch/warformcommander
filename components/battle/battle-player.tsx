'use client';

/**
 * `BattlePlayer` (Feature 5, T016) — the root client boundary for the playback screen and the **only**
 * stateful node. Given a decoded {@link WireReplay}, it constructs the pure {@link createReplayView}
 * (which gates `formatVersion`), drives {@link usePlayback}, projects the current tick with
 * `buildViewModel`, and composes {@link OverallStats} + {@link BattleStage} + a play/pause control.
 *
 * P6 spine: this imports **no engine module** — every frame is `snapshotAt(tick)` indexed by the view;
 * nothing simulates. If the reader rejects the replay, it renders the **graceful reject** state with
 * **zero battle frames** (FR-003/SC-007) — never a partial battlefield. The full control cluster +
 * scrubber + markers land in US2–US5; US1 is the watchable play-through.
 */

import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import type { Side, WireReplay } from '@/sim/replay-reader';
import { createReplayView, type ReplayView } from '@/sim/replay-view';

import { BattleStage } from './battle-stage';
import { OverallStats } from './overall-stats';
import { usePlayback } from './use-playback';

export interface BattlePlayerProps {
  /** already fetched + typed (Feature 7); the reader gates `formatVersion` on construction. */
  replay: WireReplay;
  /** which side is "friendly" for this viewer. */
  playerSide: Side;
  initialGame?: number;
  /** "Skip to Outcome" target (Feature 6) when present. */
  summaryHref?: string;
}

/** The zero-frames reject surface for an unreadable replay (mirrors `error.tsx`; FR-003/SC-007). */
function BattleReject() {
  return (
    <Panel inset="sunken" className="flex flex-col items-start gap-3">
      <h1 className="type-h2 text-text-strong">Replay unavailable</h1>
      <p className="type-body max-w-prose text-text-muted">
        This battle can&rsquo;t be played — the replay is in a format this build can&rsquo;t read. No
        partial battle is shown.
      </p>
    </Panel>
  );
}

export function BattlePlayer({ replay, playerSide, initialGame = 0, summaryHref }: BattlePlayerProps) {
  // Construct the pure view once; a rejected formatVersion surfaces as the graceful reject (no throw
  // into render). Kept in the outer component so the inner one calls its hooks unconditionally.
  const built = useMemo(() => {
    try {
      return { view: createReplayView(replay, playerSide) as ReplayView, error: null as Error | null };
    } catch (error) {
      return { view: null, error: error as Error };
    }
  }, [replay, playerSide]);

  if (!built.view) return <BattleReject />;

  const game = Math.min(Math.max(0, initialGame), built.view.gamesCount - 1);
  return <BattlePlayerInner view={built.view} initialGame={game} summaryHref={summaryHref} />;
}

function BattlePlayerInner({
  view,
  initialGame,
  summaryHref,
}: {
  view: ReplayView;
  initialGame: number;
  summaryHref?: string;
}) {
  const player = usePlayback(view, { initialGame });
  const vm = view.buildViewModel(player.gameIndex, player.currentTick);
  const tickRate = view.tickRate || 10;

  const tickStr = `${player.currentTick} / ${player.lastTick}`;
  const timeStr = `${(player.currentTick / tickRate).toFixed(1)}s`;
  const gameLabel = `GAME ${player.gameIndex + 1} / ${view.gamesCount}`;

  return (
    <section className="flex flex-col gap-3">
      <OverallStats
        player={vm.stats.player}
        enemy={vm.stats.enemy}
        tickStr={tickStr}
        timeStr={timeStr}
        gameLabel={gameLabel}
      />

      <BattleStage view={vm} progress={vm.progress} />

      {/* Minimal US1 transport — the full control cluster + scrubber + markers arrive in US2–US5. */}
      <div className="flex items-center justify-center gap-3">
        <Button type="button" onClick={player.toggle} aria-label={player.isPlaying ? 'Pause' : 'Play'}>
          {player.isPlaying ? '❚❚ Pause' : '▶ Play'}
        </Button>
        {summaryHref && (
          <Button asChild variant="secondary">
            <a href={summaryHref}>Skip to Outcome →</a>
          </Button>
        )}
      </div>
    </section>
  );
}
