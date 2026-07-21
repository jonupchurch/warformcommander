/**
 * Ladder route (Feature 9, T020 — US1) — a Server Component. Validates the URL params (Principle II),
 * reads the public board (`getLadderPage`) + the signed-in viewer's own standing (`getViewerStanding`),
 * maps them to the display view-model, and renders the {@link Leaderboard}. Read-only — it never
 * writes standings/matches (P6, FR-015). Anonymous visitors still see the board (the viewer card
 * prompts sign-in).
 */

import type { Metadata } from 'next';

import { Leaderboard } from '@/components/ladder/leaderboard';
import { MetricTabs, RangeTabs } from '@/components/ladder/metric-tabs';
import { NetVictoryExplainer } from '@/components/ladder/net-victory-explainer';
import { buildLadderHref, parseLadderParams } from '@/components/ladder/searchparams';
import { toLadderRows, toViewerStanding, type ViewerStandingVM } from '@/components/ladder/view-model';
import { AuthError } from '@/server/authz';
import { getLadderPage, getViewerStanding } from '@/server/ladder/queries';
import { requireSession } from '@/server/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ladder — Warform Commander' };

const PAGE_SIZE = 50;

export default async function LadderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseLadderParams(await searchParams);

  let viewerId: string | null = null;
  try {
    viewerId = (await requireSession()).id;
  } catch (e) {
    if (!(e instanceof AuthError)) throw e; // anonymous → public board, no viewer card
  }

  const board = await getLadderPage({
    metric: params.metric,
    range: params.range,
    includeBots: params.includeBots,
    limit: PAGE_SIZE,
    page: params.page,
  });
  const rowsData = board.ok ? board.value.rows : [];
  const rows = toLadderRows(rowsData, viewerId, params.metric);

  let viewer: ViewerStandingVM | null = null;
  if (viewerId) {
    const standing = await getViewerStanding(viewerId, {
      range: params.range,
      metric: params.metric,
      includeBots: params.includeBots,
    });
    if (standing.ok) viewer = toViewerStanding(standing.value, params.metric);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="type-display text-2xl text-text-strong">LADDER</h1>
        <p className="type-body text-sm text-text-muted">
          Every commander ranked by net victories — attack wins minus defense losses. A weak defense
          bleeds rank.
        </p>
      </header>

      <Leaderboard
        rows={rows}
        viewer={viewer}
        page={params.page}
        hasMore={board.ok ? board.value.hasMore : false}
        totalRanked={board.ok ? board.value.totalRanked : 0}
        hrefForPage={(page) => buildLadderHref(params, { page })}
        explainer={<NetVictoryExplainer />}
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <RangeTabs current={params.range} hrefFor={(range) => buildLadderHref(params, { range })} />
            <MetricTabs current={params.metric} hrefFor={(metric) => buildLadderHref(params, { metric })} />
          </div>
        }
      />
    </div>
  );
}
