/**
 * Practice route (Feature 8, T040 — US4) — a Server Component that loads the player's own squads
 * (any owned squad can practice) and an initial hidden opponent draw, then hands them to the client
 * {@link PracticePanel}. The draw is fogged server-side (identity + behavior stripped) before it
 * ever reaches the browser. This page never resolves or records — the panel commits through the
 * Node practice resolve route.
 */

import Link from 'next/link';

import { PracticePanel, type SquadChoice } from './practice-panel';
import { toPracticePreview, type PracticePreview } from './fog';
import { refreshPracticeOpponent } from '@/server/practice';
import { AuthError } from '@/server/authz';
import { requireSession } from '@/server/session';
import { listSquads } from '@/server/squads';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';

export const dynamic = 'force-dynamic';

export default async function PracticePage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (e) {
    if (e instanceof AuthError) {
      return (
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-16 text-center">
          <h1 className="type-display text-2xl text-text-strong">PRACTICE</h1>
          <p className="type-body text-sm text-text-muted">
            Sign in to test your squads against hidden opponents — no stakes, no standing.
          </p>
          <Button asChild size="lg">
            <Link href="/api/auth/signin">Sign in</Link>
          </Button>
        </div>
      );
    }
    throw e;
  }

  const squadsResult = await listSquads(actor);
  const squads: SquadChoice[] = squadsResult.ok
    ? squadsResult.value.map((s) => ({ id: s.id, name: s.name, powerRating: s.powerRating }))
    : [];

  // The opening hidden draw (US4) — null when the pool has no other player's squad yet.
  let initial: PracticePreview | null = null;
  if (squads.length > 0) {
    const draw = await refreshPracticeOpponent(actor);
    if (draw.ok) initial = await toPracticePreview(draw.value);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="type-display text-2xl text-text-strong">PRACTICE</h1>
        <p className="type-body text-sm text-text-muted">
          Free, no-stakes matches against a random hidden opponent. Nothing here moves your ladder
          standing.
        </p>
      </header>

      <PracticePanel squads={squads} initial={initial} />

      <Panel inset="sunken" className="flex flex-col gap-2">
        <span className="type-eyebrow text-text-muted">PRACTICE RULES</span>
        <ul className="type-body flex list-disc flex-col gap-1 pl-5 text-xs text-text-muted">
          <li>The opponent is a random squad served blind — you never learn whose it is.</li>
          <li>Refresh as many times as you like before deploying; it costs nothing.</li>
          <li>Adaptation is on (free-adaptation), and no result is recorded to the ladder.</li>
        </ul>
      </Panel>
    </div>
  );
}
