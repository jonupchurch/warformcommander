/**
 * Arena route (Feature 8, T018 — US1) — a Server Component that loads the two inputs the client
 * {@link DeployPanel} needs: the player's **attackable** squads (F7 `listAttackable`) and an initial
 * server-matched, fogged {@link MatchTicket} (`previewRankedMatch`). Both come from the resolved
 * session — never a client-supplied id (P6). The panel commits the attack through the Node resolve
 * route; this page never resolves or records anything.
 */

import Link from 'next/link';

import { DeployPanel, type AttackChoice } from './deploy-panel';
import type { RerollResult } from './actions';
import { previewRankedMatch } from '@/server/arena';
import { fogPreview } from '@/server/arena-types';
import { AuthError } from '@/server/authz';
import { getCurrentRuleset } from '@/server/ruleset';
import { requireSession } from '@/server/session';
import { listAttackable } from '@/server/squads';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';

export const dynamic = 'force-dynamic';

export default async function ArenaPage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (e) {
    if (e instanceof AuthError) {
      return (
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-16 text-center">
          <h1 className="type-display text-2xl text-text-strong">ARENA</h1>
          <p className="type-body text-sm text-text-muted">
            Sign in to attack a live defender and climb the ladder.
          </p>
          <Button asChild size="lg">
            <Link href="/api/auth/signin">Sign in</Link>
          </Button>
        </div>
      );
    }
    throw e;
  }

  const attackableResult = await listAttackable(actor);
  const attackRows = attackableResult.ok ? attackableResult.value : [];
  // Each attackable squad's own breakdown (composition + power + damage-family tags) for the
  // pre-battle side-by-side. It's the player's OWN army — no fog needed; `fogPreview` just yields the
  // shared preview shape the board renders. Read the ruleset once (only when there's something to show).
  const ruleset = attackRows.length > 0 ? (await getCurrentRuleset()).ruleset : null;
  const attackable: AttackChoice[] = ruleset
    ? attackRows.map((s) => ({
        id: s.id,
        name: s.name,
        powerRating: s.powerRating,
        preview: fogPreview(s.config, ruleset, s.powerRating),
      }))
    : [];

  // The opening server-matched ticket (US1) — re-rolled client-side via the skip action (US2). We
  // only preview when the player has something to attack with (FR-001).
  let initial: RerollResult;
  if (attackable.length === 0) {
    initial = { ok: false, error: 'NOT_ATTACKABLE', reason: 'no attackable squad' };
  } else {
    const preview = await previewRankedMatch(actor);
    initial = preview.ok
      ? { ok: true, ticket: preview.value }
      : { ok: false, error: preview.error, reason: preview.reason };
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="type-display text-2xl text-text-strong">ARENA</h1>
        <p className="type-body text-sm text-text-muted">
          Pick a squad, size up a blind-served defender, and deploy. The server resolves the
          best-of-three — the result is never yours to write.
        </p>
      </header>

      <DeployPanel attackable={attackable} initial={initial} />

      <Panel inset="sunken" className="flex flex-col gap-2">
        <span className="type-eyebrow text-text-muted">HOW RANKED WORKS</span>
        <ul className="type-body flex list-disc flex-col gap-1 pl-5 text-xs text-text-muted">
          <li>The opponent is chosen by the server at random — you never pick who you face.</li>
          <li>Their behavior is served blind and locked for all three games.</li>
          <li>Skip to re-roll a fresh opponent before you commit — that costs nothing.</li>
        </ul>
      </Panel>
    </div>
  );
}
