import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * News-index pagination (T034, FR-009) — prev/next over the published-post count, newest page first.
 * A server component: `makeHref(page)` preserves the active `type` filter. Renders nothing on a
 * single page.
 */
export function NewsPagination({
  page,
  totalPages,
  makeHref,
}: {
  page: number;
  totalPages: number;
  makeHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const control = (label: string, target: number, disabled: boolean) =>
    disabled ? (
      <span
        aria-disabled
        className="type-label rounded-md border border-border px-4 py-2 text-text-faint"
      >
        {label}
      </span>
    ) : (
      <Link
        href={makeHref(target)}
        rel={label === "Newer" ? "prev" : "next"}
        className={cn(
          "type-label rounded-md border border-border-strong px-4 py-2 text-text-strong transition-colors hover:bg-surface-raised",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {label}
      </Link>
    );

  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-between gap-4">
      {control("Newer", page - 1, page <= 1)}
      <span className="type-eyebrow text-text-muted">
        Page {page} / {totalPages}
      </span>
      {control("Older", page + 1, page >= totalPages)}
    </nav>
  );
}
