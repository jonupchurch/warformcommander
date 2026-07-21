"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import type { PostType } from "@/server/posts";

/** The filter chips → `posts.type` (the read layer filters by type; FR-010). "All" clears the filter. */
const FILTERS: { label: string; type: PostType | null }[] = [
  { label: "All", type: null },
  { label: "News", type: "editorial" },
  { label: "Balance", type: "balance" },
  { label: "Devlog", type: "devlog" },
  { label: "Changelog", type: "changelog" },
];

/**
 * News-index category filter (T035, FR-010): chips that set `?type=` (resetting to page 1). Active
 * state derives from the current `type` search param; an unrecognized value renders "All" active.
 */
export function CategoryFilter() {
  const params = useSearchParams();
  const current = params.get("type");

  return (
    <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2">
      {FILTERS.map((f) => {
        const active = f.type === null ? !current : current === f.type;
        const href = f.type ? `/news?type=${f.type}` : "/news";
        return (
          <Link
            key={f.label}
            href={href}
            aria-current={active ? "true" : undefined}
            className={cn(
              "type-eyebrow rounded-sm border px-3 py-1.5 transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "border-faction-friendly text-faction-friendly"
                : "border-border-strong text-text-muted hover:text-text-strong",
            )}
          >
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}
