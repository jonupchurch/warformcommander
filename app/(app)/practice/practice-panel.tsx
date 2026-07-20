'use client';

/**
 * `PracticePanel` (Feature 8, T040 — US4) — the no-stakes client leaf. Pick one of *your own*
 * squads, size up a hidden opponent, **↻ REFRESH** to draw a different one (a Server Action that
 * records nothing), and **DEPLOY** → `POST /api/practice/resolve`. The body carries only
 * `{ attackSquadId, opponentSquadId }`; the outcome is server-computed (P6). Practice moves no
 * standing and never reveals who you faced. On `{ matchId }` it navigates to the Battle Summary.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { PreviewBoard } from '@/components/arena/preview-board';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { cn } from '@/lib/utils';

import { redrawOpponent } from './actions';
import type { PracticePreview } from './fog';

export interface SquadChoice {
  id: string;
  name: string;
  powerRating: number;
}

export interface PracticePanelProps {
  squads: SquadChoice[];
  /** The initial hidden draw, or null if no opponent squad exists in the pool yet. */
  initial: PracticePreview | null;
}

export function PracticePanel({ squads, initial }: PracticePanelProps) {
  const router = useRouter();
  const [draw, setDraw] = useState<PracticePreview | null>(initial);
  const [squadId, setSquadId] = useState<string>(squads[0]?.id ?? '');
  const [isRefreshing, startRefresh] = useTransition();
  const [isDeploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDeploy = Boolean(draw && squadId) && !isDeploying && !isRefreshing;

  function onRefresh() {
    setError(null);
    startRefresh(async () => {
      const next = await redrawOpponent(draw?.opponentSquadId);
      if (next.ok) setDraw(next.draw);
      else setError(next.reason ?? 'No other opponent to draw.');
    });
  }

  async function onDeploy() {
    if (!draw || !squadId) return;
    setDeploying(true);
    setError(null);
    try {
      const res = await fetch('/api/practice/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attackSquadId: squadId, opponentSquadId: draw.opponentSquadId }),
      });
      const data = (await res.json().catch(() => ({}))) as { matchId?: string; reason?: string };
      if (res.ok && data.matchId) {
        router.push(`/matches/${data.matchId}/summary`);
        return;
      }
      setError(data.reason ?? 'Practice deploy failed. Refresh the opponent and try again.');
      setDeploying(false);
    } catch {
      setError('Network error. Try again.');
      setDeploying(false);
    }
  }

  if (squads.length === 0) {
    return (
      <Panel inset="rail" eyebrow="PRACTICE" className="flex flex-col gap-4">
        <p className="type-body text-sm text-text-muted">
          You need at least one saved squad to practice. Build one in the Garage first.
        </p>
        <Button asChild variant="secondary" className="w-full">
          <a href="/garage">Go to Garage</a>
        </Button>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel inset="rail" eyebrow="HIDDEN OPPONENT" className="flex flex-col gap-4">
        {draw ? (
          <>
            <PreviewBoard
              preview={draw.preview}
              className={cn(isRefreshing && 'opacity-50 transition-opacity')}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={onRefresh}
              disabled={isRefreshing || isDeploying}
              className="w-full"
            >
              {isRefreshing ? 'Drawing…' : '↻ Refresh opponent'}
            </Button>
          </>
        ) : (
          <p className="type-body text-sm text-text-muted">
            No opponent squads are available to practice against yet.
          </p>
        )}
      </Panel>

      <Panel inset="rail" eyebrow="YOUR SQUAD" className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="type-eyebrow mb-1 text-text-muted">DEPLOY WITH</legend>
          {squads.map((squad) => (
            <label
              key={squad.id}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors',
                squad.id === squadId
                  ? 'border-faction-friendly bg-faction-friendly-soft'
                  : 'border-border hover:bg-surface-raised',
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="practiceSquad"
                  value={squad.id}
                  checked={squad.id === squadId}
                  onChange={() => setSquadId(squad.id)}
                  className="accent-faction-friendly"
                />
                <span className="type-readout text-sm text-text-strong">{squad.name}</span>
              </span>
              <span className="type-readout text-xs tabular-nums text-text-muted">
                PWR {squad.powerRating.toLocaleString()}
              </span>
            </label>
          ))}
        </fieldset>

        {error && (
          <p role="alert" className="type-body text-xs text-faction-enemy">
            {error}
          </p>
        )}

        <Button type="button" size="lg" onClick={onDeploy} disabled={!canDeploy} className="w-full">
          {isDeploying ? 'Resolving…' : 'Deploy practice match'}
        </Button>
      </Panel>
    </div>
  );
}
