/**
 * `LadderPagination` (Feature 9, T018 — US1) — prev/next page controls that preserve the current
 * metric/range in the URL. `next/link`s styled as buttons so paging is keyboard-operable with visible
 * focus. Disabled ends render as inert text, not dead links.
 */

import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface LadderPaginationProps {
  page: number;
  hasMore: boolean;
  /** Build the href for a target page, preserving the other params. */
  hrefForPage: (page: number) => string;
  className?: string;
}

export function LadderPagination({ page, hasMore, hrefForPage, className }: LadderPaginationProps) {
  if (page <= 1 && !hasMore) return null;
  const prevDisabled = page <= 1;
  const linkCls = buttonVariants({ variant: 'secondary', size: 'sm' });
  const disabledCls = 'type-eyebrow inline-flex h-8 items-center rounded-md px-3 text-text-muted opacity-40';

  return (
    <nav aria-label="Ladder pages" className={cn('flex items-center justify-between gap-3', className)}>
      {prevDisabled ? (
        <span className={disabledCls} aria-disabled="true">
          ← Prev
        </span>
      ) : (
        <Link href={hrefForPage(page - 1)} className={linkCls} rel="prev">
          ← Prev
        </Link>
      )}
      <span className="type-eyebrow text-text-muted">PAGE {page}</span>
      {hasMore ? (
        <Link href={hrefForPage(page + 1)} className={linkCls} rel="next">
          Next →
        </Link>
      ) : (
        <span className={disabledCls} aria-disabled="true">
          Next →
        </span>
      )}
    </nav>
  );
}
