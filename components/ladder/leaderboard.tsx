/**
 * `Leaderboard` (Feature 9, T019 — US1 orchestrator) — renders the whole board from a single dataset:
 * the pinned viewer card, an optional toolbar (metric/range tabs — US2/US3), the podium, the
 * landscape table + portrait card list (exactly one visible per orientation, SC-003), and pagination.
 * Presentational — all data is derived upstream. The board area carries the `#my-rank` anchor so the
 * viewer's "jump to my rank" scrolls here (a single id — the highlighted own-row lives inside).
 */

import { LadderCardList } from './ladder-card-list';
import { LadderPagination } from './pagination';
import { LadderTable } from './ladder-table';
import { Podium } from './podium';
import { ViewerStandingCard } from './viewer-standing-card';
import type { LadderRow, ViewerStandingVM } from './view-model';
import { cn } from '@/lib/utils';

export interface LeaderboardProps {
  rows: LadderRow[];
  viewer: ViewerStandingVM | null;
  page: number;
  hasMore: boolean;
  totalRanked: number;
  hrefForPage: (page: number) => string;
  /** metric/range tabs + explainer (US2/US3/US4) injected here so US1 stands alone. */
  toolbar?: React.ReactNode;
  explainer?: React.ReactNode;
  className?: string;
}

export function Leaderboard({
  rows,
  viewer,
  page,
  hasMore,
  totalRanked,
  hrefForPage,
  toolbar,
  explainer,
  className,
}: LeaderboardProps) {
  const showPodium = page === 1 && rows.length > 0;
  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <ViewerStandingCard viewer={viewer} />

      {explainer}

      {toolbar}

      {showPodium && <Podium rows={rows} />}

      <section id="my-rank" className="flex scroll-mt-20 flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="type-eyebrow text-text-muted">STANDINGS</h2>
          <span className="type-eyebrow text-text-muted">{totalRanked} COMMANDERS</span>
        </div>
        {rows.length === 0 ? (
          <p className="type-body rounded-lg border border-border bg-surface-rail px-4 py-6 text-center text-sm text-text-muted">
            No ranked commanders in this view yet.
          </p>
        ) : (
          <>
            <LadderTable rows={rows} />
            <LadderCardList rows={rows} />
          </>
        )}
      </section>

      <LadderPagination page={page} hasMore={hasMore} hrefForPage={hrefForPage} />
    </div>
  );
}
