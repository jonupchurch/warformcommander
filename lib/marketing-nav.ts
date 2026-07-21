/**
 * Feature 11 — the marketing navigation model (data-model §"Marketing navigation model"). The nav
 * content Feature 3 deliberately scoped to this feature: the ordered destinations
 * `Overview · News · Roadmap · Community` + a `Wishlist` CTA, distinct from Feature 3's authenticated
 * app-nav (`Garage · Arena · Ladder · Practice`). A **static constant** — not fetched, not stored.
 */

export interface MarketingNavDestination {
  id: "overview" | "news" | "roadmap" | "community";
  label: string;
  /** Overview/Roadmap/Community → a Home section anchor; News → the News index route. */
  target: { kind: "section"; href: `/#${string}` } | { kind: "route"; href: "/news" };
}

export const MARKETING_DESTINATIONS: MarketingNavDestination[] = [
  { id: "overview", label: "Overview", target: { kind: "section", href: "/#overview" } },
  { id: "news", label: "News", target: { kind: "route", href: "/news" } },
  { id: "roadmap", label: "Roadmap", target: { kind: "section", href: "/#roadmap" } },
  { id: "community", label: "Community", target: { kind: "section", href: "/#community" } },
];

/** The Wishlist CTA — the primary marketing call to action (a placeholder store anchor for v1). */
export const WISHLIST_CTA = { label: "Wishlist", href: "/#community" } as const;

/**
 * The active destination for a given pathname (News only in v1 — the Home section anchors are
 * scroll-links, not route-derived active state). Returns `null` on Home.
 */
export function activeDestinationId(pathname: string): MarketingNavDestination["id"] | null {
  return pathname === "/news" || pathname.startsWith("/news/") ? "news" : null;
}
