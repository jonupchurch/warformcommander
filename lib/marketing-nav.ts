/**
 * Feature 11 — the marketing navigation model (data-model §"Marketing navigation model"). The public
 * marketing chrome links to the marketing sections (`Overview · News · Roadmap`) **and** bridges into
 * the authenticated game app (`Garage · Arena · Ladder · Practice`) via a primary `Play` CTA, so the
 * built game is reachable from the front door — not just by direct URL. `Wishlist` remains as a
 * secondary CTA. A **static constant** — not fetched, not stored.
 */

export interface MarketingNavDestination {
  id: "overview" | "news" | "roadmap";
  label: string;
  /** Overview/Roadmap → a Home section anchor; News → the News index route. */
  target: { kind: "section"; href: `/#${string}` } | { kind: "route"; href: "/news" };
}

export const MARKETING_DESTINATIONS: MarketingNavDestination[] = [
  { id: "overview", label: "Overview", target: { kind: "section", href: "/#overview" } },
  { id: "news", label: "News", target: { kind: "route", href: "/news" } },
  { id: "roadmap", label: "Roadmap", target: { kind: "section", href: "/#roadmap" } },
];

/**
 * The game (app-shell) destinations — the bridge from the public marketing site into the built app.
 * Mirrors Feature 3's authenticated app-nav (`components/shell/primary-nav.tsx`); rendered in both the
 * marketing nav and the footer so a visitor can always reach the game.
 */
export interface AppNavDestination {
  id: "garage" | "arena" | "ladder" | "practice";
  label: string;
  href: string;
}

export const APP_DESTINATIONS: AppNavDestination[] = [
  { id: "garage", label: "Garage", href: "/garage" },
  { id: "arena", label: "Arena", href: "/arena" },
  { id: "ladder", label: "Ladder", href: "/ladder" },
  { id: "practice", label: "Practice", href: "/practice" },
];

/** The primary CTA — enter the game. Garage is the onboarding entry (build a squad, then fight). */
export const PLAY_CTA = { label: "Play", href: "/garage" } as const;

/** The Wishlist CTA — a secondary marketing call to action (a placeholder store anchor for v1). */
export const WISHLIST_CTA = { label: "Wishlist", href: "/#community" } as const;

/**
 * The active destination for a given pathname (News only in v1 — the Home section anchors are
 * scroll-links, not route-derived active state; the app links resolve their own active state inside
 * the app shell). Returns `null` on Home.
 */
export function activeDestinationId(pathname: string): MarketingNavDestination["id"] | null {
  return pathname === "/news" || pathname.startsWith("/news/") ? "news" : null;
}
