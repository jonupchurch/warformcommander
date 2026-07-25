"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { IdentityMenu } from "@/components/shell/identity-menu";
import { cn } from "@/lib/utils";
import {
  APP_DESTINATIONS,
  MARKETING_DESTINATIONS,
  PLAY_CTA,
  activeDestinationId,
  type AppNavDestination,
  type MarketingNavDestination,
} from "@/lib/marketing-nav";

/**
 * The marketing nav (T022, FR-005/FR-006): the marketing sections `Overview · News · Roadmap` plus a
 * divider and the **game** destinations `Garage · Arena · Ladder · Practice`, closed by a primary
 * `Play` CTA — so the built app is reachable from the front door, not just by direct URL. Overview/
 * Roadmap resolve to Home section anchors; News to `/news`; the game links cross into the app shell
 * (which owns their active state). Active state (News on the News routes) via `usePathname` →
 * `aria-current`. First-class in **both** orientations: an inline row in landscape, and a
 * horizontally-scrollable row (no page overflow) in portrait (P7).
 */
export function MarketingNav() {
  const pathname = usePathname();
  const active = activeDestinationId(pathname);

  const linkClass = (isActive: boolean) =>
    cn(
      "type-label whitespace-nowrap rounded-md px-3 py-2 transition-colors motion-safe:duration-150",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      isActive ? "text-faction-friendly" : "text-text-muted hover:text-text-strong",
    );

  const marketingLink = (d: MarketingNavDestination) => (
    <Link
      key={d.id}
      href={d.target.href}
      aria-current={active === d.id ? "page" : undefined}
      className={linkClass(active === d.id)}
    >
      {d.label}
    </Link>
  );

  const appLink = (d: AppNavDestination) => (
    <Link key={d.id} href={d.href} className={linkClass(false)}>
      {d.label}
    </Link>
  );

  const divider = <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />;

  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
      {/* Landscape: inline links — marketing sections · game destinations */}
      <nav aria-label="Marketing" className="hidden items-center gap-0.5 md:flex">
        {MARKETING_DESTINATIONS.map(marketingLink)}
        {divider}
        {APP_DESTINATIONS.map(appLink)}
      </nav>
      {/* Log In (secondary) sits left of the primary Play CTA. The marketing site is statically
          rendered and intentionally unauthenticated, so this is a plain always-available entry point
          — not session-aware (reading auth() here would force every marketing page dynamic). */}
      <IdentityMenu />
      <Button asChild size="sm">
        <Link href={PLAY_CTA.href}>{PLAY_CTA.label}</Link>
      </Button>

      {/* Portrait: a scrollable link row (below the brand+CTA), so nothing overflows the viewport */}
      <nav
        aria-label="Marketing"
        className="absolute inset-x-0 top-16 flex items-center gap-0.5 overflow-x-auto border-b border-border bg-surface-chrome px-safe py-1 [backdrop-filter:blur(var(--blur-chrome))] md:hidden"
      >
        {MARKETING_DESTINATIONS.map(marketingLink)}
        {divider}
        {APP_DESTINATIONS.map(appLink)}
      </nav>
    </div>
  );
}
