"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MARKETING_DESTINATIONS,
  WISHLIST_CTA,
  activeDestinationId,
  type MarketingNavDestination,
} from "@/lib/marketing-nav";

/**
 * The marketing nav (T022, FR-005/FR-006): `Overview · News · Roadmap · Community` + a Wishlist CTA.
 * Overview/Roadmap/Community resolve to Home section anchors; News to `/news`. Active state (News on
 * the News routes) via `usePathname` → `aria-current`. First-class in **both** orientations: an
 * inline row in landscape, and a horizontally-scrollable row (no page overflow) in portrait (P7).
 */
export function MarketingNav() {
  const pathname = usePathname();
  const active = activeDestinationId(pathname);

  const link = (d: MarketingNavDestination) => (
    <Link
      key={d.id}
      href={d.target.href}
      aria-current={active === d.id ? "page" : undefined}
      className={cn(
        "type-label whitespace-nowrap rounded-md px-3 py-2 transition-colors motion-safe:duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active === d.id ? "text-faction-friendly" : "text-text-muted hover:text-text-strong",
      )}
    >
      {d.label}
    </Link>
  );

  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
      {/* Landscape: inline links */}
      <nav aria-label="Marketing" className="hidden items-center gap-0.5 md:flex">
        {MARKETING_DESTINATIONS.map(link)}
      </nav>
      <Button asChild size="sm">
        <Link href={WISHLIST_CTA.href}>{WISHLIST_CTA.label}</Link>
      </Button>

      {/* Portrait: a scrollable link row (below the brand+CTA), so nothing overflows the viewport */}
      <nav
        aria-label="Marketing"
        className="absolute inset-x-0 top-16 flex items-center gap-0.5 overflow-x-auto border-b border-border bg-surface-chrome px-safe py-1 [backdrop-filter:blur(var(--blur-chrome))] md:hidden"
      >
        {MARKETING_DESTINATIONS.map(link)}
      </nav>
    </div>
  );
}
