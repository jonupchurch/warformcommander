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

import { Panel } from '@/components/ui/panel';
import type { Side, WireReplay } from '@/sim/replay-reader';
import { createReplayView, type ReplayView } from '@/sim/replay-view';

import { BattleStage } from './battle-stage';
import { OverallStats } from './overall-stats';
import { PlaybackControls } from './playback-controls';
import { Scrubber } from './scrubber';
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

  // Space / K toggle play from anywhere in the player region (research C2). Space is skipped when a
  // control that owns it has focus (a Button activates on Space) — K stays a universal toggle.
  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const tag = (event.target as HTMLElement).tagName;
    const controlHasSpace = tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (event.key === 'k' || event.key === 'K') {
      event.preventDefault();
      player.toggle();
    } else if (event.key === ' ' && !controlHasSpace) {
      event.preventDefault();
      player.toggle();
    }
  }

  return (
    <section className="flex flex-col gap-3" onKeyDown={onKeyDown}>
      <OverallStats
        player={vm.stats.player}
        enemy={vm.stats.enemy}
        tickStr={tickStr}
        timeStr={timeStr}
        gameLabel={gameLabel}
      />

      <BattleStage view={vm} progress={vm.progress} />

      {/* Transport panel: the full control cluster over the O(1) media-seek scrubber (US4 overlays
          event markers on the track). */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-rail px-3 py-3 sm:px-5">
        <PlaybackControls
          isPlaying={player.isPlaying}
          speed={player.speed}
          atEnd={player.atEnd}
          onToggle={player.toggle}
          onStep={player.step}
          onJumpStart={() => player.seek(0)}
          onJumpEnd={() => player.seek(player.lastTick)}
          onSetSpeed={player.setSpeed}
          summaryHref={summaryHref}
        />
        <div className="flex items-center gap-3">
          <Scrubber
            currentTick={player.currentTick}
            lastTick={player.lastTick}
            tickRate={tickRate}
            onSeek={player.seek}
            className="flex-1"
          />
          <span className="type-readout min-w-24 text-right text-xs text-text-muted tabular-nums">
            {tickStr} · {timeStr}
          </span>
        </div>
      </div>
    </section>
  );
}
