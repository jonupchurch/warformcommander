'use client';

/**
 * `DeployPanel` (Feature 8, T019/T025/T026 — US1/US2) — the client leaf that commits a ranked
 * attack. It owns three interactions and **no authority**: pick which of *your own* attackable
 * squads deploys, **↻ SKIP** to re-roll the server-matched opponent (a Server Action that records
 * nothing), and **DEPLOY** → `POST /api/arena/resolve`. The request body carries only
 * `{ attackSquadId, ticketSnapshotId }`; the opponent, seed, ruleset, and outcome are all
 * server-decided (P6). On `{ matchId }` it navigates to the Battle Summary for that match.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { PreviewBoard } from '@/components/arena/preview-board';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { cn } from '@/lib/utils';
import type { MatchTicket } from '@/server/arena-types';

import { rerollOpponent, type RerollResult } from './actions';

export interface AttackChoice {
  id: string;
  name: string;
  powerRating: number;
}

export interface DeployPanelProps {
  attackable: AttackChoice[];
  /** The initial server-matched ticket, or a typed reason it could not be produced. */
  initial: RerollResult;
}

/** Human copy for the states the player can land in with nothing to deploy against. */
function reasonCopy(error: string): string {
  switch (error) {
    case 'NOT_ATTACKABLE':
      return 'You have no attackable squad. Build one in the Garage, or free up a squad currently assigned to defense.';
    case 'NO_OPPONENT':
      return 'No opponent is available right now. Try again in a moment.';
    default:
      return 'Matchmaking is unavailable right now. Try again in a moment.';
  }
}

export function DeployPanel({ attackable, initial }: DeployPanelProps) {
  const router = useRouter();
  const [state, setState] = useState<RerollResult>(initial);
  const [squadId, setSquadId] = useState<string>(attackable[0]?.id ?? '');
  const [isRerolling, startReroll] = useTransition();
  const [isDeploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const ticket: MatchTicket | null = state.ok ? state.ticket : null;
  const canDeploy = Boolean(ticket && squadId) && !isDeploying && !isRerolling;

  function onSkip() {
    setDeployError(null);
    startReroll(async () => {
      const next = await rerollOpponent();
      setState(next);
    });
  }

  async function onDeploy() {
    if (!ticket || !squadId) return;
    setDeploying(true);
    setDeployError(null);
    try {
      const res = await fetch('/api/arena/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attackSquadId: squadId, ticketSnapshotId: ticket.defenderSnapshotId }),
      });
      const data = (await res.json().catch(() => ({}))) as { matchId?: string; reason?: string };
      if (res.ok && data.matchId) {
        router.push(`/matches/${data.matchId}/summary`);
        return;
      }
      setDeployError(data.reason ?? 'Deploy failed. Re-roll the opponent and try again.');
      setDeploying(false);
    } catch {
      setDeployError('Network error. Try again.');
      setDeploying(false);
    }
  }

  // No attackable squad, or matchmaking could not produce a ticket → the blocked state (AS4/NO_OPPONENT).
  if (attackable.length === 0 || !ticket) {
    const error = !state.ok ? state.error : 'NOT_ATTACKABLE';
    return (
      <Panel inset="rail" eyebrow="DEPLOYMENT" className="flex flex-col gap-4">
        <p className="type-body text-sm text-text-muted">{reasonCopy(error)}</p>
        <Button asChild variant="secondary" className="w-full">
          <a href="/garage">Go to Garage</a>
        </Button>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel inset="rail" eyebrow="ENEMY DEFENSE — SERVED BLIND" className="flex flex-col gap-4">
        <PreviewBoard
          preview={ticket.preview}
          opponentHandle={ticket.defenderHandle}
          className={cn(isRerolling && 'opacity-50 transition-opacity')}
        />
        <Button
          type="button"
          variant="ghost"
          onClick={onSkip}
          disabled={isRerolling || isDeploying}
          className="w-full"
        >
          {isRerolling ? 'Finding…' : '↻ Skip opponent'}
        </Button>
      </Panel>

      <Panel inset="rail" eyebrow="DEPLOYMENT" className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="type-eyebrow mb-1 text-text-muted">ATTACK SQUAD</legend>
          {attackable.map((squad) => (
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
                  name="attackSquad"
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

        {deployError && (
          <p role="alert" className="type-body text-xs text-faction-enemy">
            {deployError}
          </p>
        )}

        <Button type="button" size="lg" onClick={onDeploy} disabled={!canDeploy} className="w-full">
          {isDeploying ? 'Resolving…' : 'Deploy attack'}
        </Button>
      </Panel>
    </div>
  );
}
