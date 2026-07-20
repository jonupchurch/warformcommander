/**
 * Battle Summary route (Feature 6, T013) — a Server Component that reads the persisted `MatchResult`
 * + context for `matchId`, derives the display ViewModel, and renders the outcome hero + per-game
 * breakdown inside the Feature 3 shell. **Reader, not simulator** (SC-007): no replay player is
 * mounted and no simulation runs — the replay is only *referenced* via the action hrefs.
 *
 * NOTE — read source: a real persisted match (Feature 7 `getMatch`/`getReplay`, scoped to the signed-in
 * viewer via `loadRealSummary`) is the source now that Feature 8 records matches. A non-real id (the
 * `e2e-*` demo links) falls back to the committed demo battery (`lib/battle-summary/demo.ts`), so the
 * demo surface and its e2e stay exercisable. Still a reader (SC-007) — no player is mounted.
 */

import { GameBreakdown } from '@/components/battle-summary/game-breakdown';
import { MatchTotals } from '@/components/battle-summary/match-totals';
import { MvpCard } from '@/components/battle-summary/mvp-card';
import { OutcomeHero } from '@/components/battle-summary/outcome-hero';
import { PerMachineFates } from '@/components/battle-summary/per-machine-fates';
import { StandingDelta } from '@/components/battle-summary/standing-delta';
import { SummaryActions } from '@/components/battle-summary/summary-actions';
import { loadSummaryContext } from '@/lib/battle-summary/demo';
import { deriveSummaryViewModel } from '@/lib/battle-summary/view-model';
import { AuthError } from '@/server/authz';
import { loadRealSummary } from '@/server/match-read';
import { requireSession } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function BattleSummaryPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;

  let viewerId: string | undefined;
  try {
    viewerId = (await requireSession()).id;
  } catch (e) {
    if (!(e instanceof AuthError)) throw e; // anonymous → demo fallback below
  }

  const real = await loadRealSummary(matchId, viewerId);
  const { result, ctx } = real ?? loadSummaryContext(matchId);
  const vm = deriveSummaryViewModel(result, ctx);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <OutcomeHero outcome={vm.outcome} series={vm.series}>
        <StandingDelta standing={vm.standing} />
      </OutcomeHero>

      <MatchTotals totals={vm.totals} />

      {/* Per-game breakdown beside the MVP in landscape; stacked in portrait (D4). */}
      <div className={vm.mvp ? 'grid gap-5 lg:grid-cols-[1fr_20rem]' : 'grid gap-5'}>
        <section className="flex flex-col gap-3">
          <h2 className="type-eyebrow text-text-muted">PER-GAME BREAKDOWN</h2>
          <GameBreakdown perGame={vm.perGame} />
        </section>
        <MvpCard mvp={vm.mvp} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="type-eyebrow text-text-muted">MACHINE FATES</h2>
        <PerMachineFates perMachine={vm.perMachine} />
      </section>

      <SummaryActions actions={vm.actions} className="pt-2" />
    </div>
  );
}
