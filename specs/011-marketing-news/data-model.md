# Data Model: Marketing Site — Home + News Index + Article Template

**Feature**: `011-marketing-news` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

This feature **adds no persistent tables**. Its "data" is (1) a **read view-model** projected from
Feature 7's `posts` table and (2) a small **marketing navigation model** — the UI analogue of
Feature 1's game-data schema (constitution **P8** — one source of truth), applied to the public
site. The persistent schema is entirely [Feature 7's](../007-accounts-persistence/data-model.md);
this doc references it and never re-declares it. The machine-readable contracts live in
[contracts/post-view.md](./contracts/post-view.md) (the read query surface + view-model + safe
markdown-render contract) and [contracts/routes.md](./contracts/routes.md) (the route map +
rendering/metadata/revalidation contract).

**Source table (Feature 7 — [007 data-model → `posts`](../007-accounts-persistence/data-model.md)):**
`slug` (unique), `title`, `excerpt?`, `body` (markdown), `type`
(`editorial|balance|devlog|changelog`), `status` (`draft|published`), `authorId?` (null ⇒
system/auto post), `metadata?` (jsonb), `publishedAt?`, `createdAt`, `updatedAt`. Reads go through
this feature's **own** read layer (`src/lib/posts.ts`) — never a raw Drizzle query from a view —
which is the single trust boundary constraining every query to `status='published' AND
publishedAt <= now` (FR-015, SC-001). This feature has **no write path** (FR-016); Feature 12 +
the code-push/balance-edit auto-post triggers are the only writers.

---

## The post read view-models

Assembled by `src/lib/posts.ts` (raw, published-only reads) and mapped by `src/lib/post-view.ts`
(pure projection). TypeScript-shaped (illustrative, not the implementation) — full signatures in
[contracts/post-view.md](./contracts/post-view.md).

```ts
interface PostSummary {              // News index card / featured item / Home teaser
  slug: string;
  title: string;
  excerpt: string;                   // posts.excerpt, or derived from body's first prose (edge case)
  badge: PostBadge;                  // derived from `type` (+ metadata.category for editorial)
  publishedAt: Date;
  image: string | null;              // metadata.image, else null (card degrades gracefully)
  featured: boolean;                 // most-recent published, or metadata.featured override
}

interface PostView extends PostSummary {   // the article page's full projection
  bodyHtml: React.ReactNode;         // markdown rendered through the safe pipeline (never a raw string)
  byline: string;                    // author's handle, or a studio/system byline when authorId is null
  readTimeMinutes: number;           // estimated from body word count
  ogImage: string;                   // metadata.ogImage, else metadata.image, else the default key-art asset
  metadata: Record<string, unknown> | null;   // surfaced as-is for the article template (balance delta, commit SHA)
}

interface PostBadge {                // the display badge + Feature 3 Chip tone (research X2)
  label: string;                     // "DEVLOG" | "BALANCE" | "DESIGN" | "TECH" | "COMMUNITY" | "NEWS" (fallback)
  tone: ChipProps["tone"];           // a Feature 3 Chip tone — see mapping below
}
```

- `PostSummary` is never assembled from a raw `posts` row in a view — only from `src/lib/posts.ts`'s
  typed, published-only reads (X3, Principle II).
- `excerpt`/`image` degrade gracefully when absent (spec edge cases); `bodyHtml` is **only** present
  on `PostView` (the index never renders a body).

### `type` → badge/tone mapping (research X2)

The persistence `type` enum is the filter/badge source of truth (P8); the mockups' richer editorial
categories ride in `metadata.category` without a schema change.

| `posts.type` | `metadata.category` | Badge label | Chip `tone` |
|---|---|---|---|
| `devlog` | — | `DEVLOG` | `friendly` (cyan) |
| `balance` | — | `BALANCE` | `energy` (orange) |
| `changelog` | — | `DEVLOG` *(shares the devlog badge — both are code-push artifacts)* | `friendly` |
| `editorial` | `"design"` | `DESIGN` | `energy` |
| `editorial` | `"tech"` | `TECH` | `air` (purple) |
| `editorial` | `"community"` | `COMMUNITY` | `enemy` (magenta) *(mockup COMMUNITY chip color)* |
| `editorial` | *(absent/unrecognized)* | `NEWS` | `neutral` |
| *(any, unrecognized `type`)* | — | `NEWS` | `neutral` |

`toBadge(post: PostSummaryRaw): PostBadge` in `src/lib/post-view.ts` is the single implementation
of this table (tested — [tasks.md](./tasks.md)). An unrecognized category **always** falls back to
`NEWS`/`neutral`, never throws (edge case).

### Featured-post derivation (research X2)

`featured = true` for the **most-recently published** post in the current page/window, unless a
published post's `metadata.featured === true` overrides the pick (spec Assumptions). At most one
`PostSummary` in a given `getPublishedPosts` page is `featured`.

---

## Marketing navigation model

The nav content Feature 3 deliberately scoped to this feature
([`003-app-shell/data-model.md` → Marketing shell](../003-app-shell/data-model.md)) — the ordered
destinations `Overview · News · Roadmap · Community` + the `Wishlist` CTA, distinct from Feature
3's authenticated app-nav model (`Garage · Arena · Ladder · Practice`). Defined here; rendered by
`src/components/marketing/marketing-nav.tsx` (FR-005, FR-006).

```ts
interface MarketingNavDestination {
  id: "overview" | "news" | "roadmap" | "community";
  label: string;                     // "Overview" | "News" | "Roadmap" | "Community"
  target:
    | { kind: "section"; href: `/#${string}` }   // Overview/Roadmap/Community → Home section anchor
    | { kind: "route"; href: "/news" };          // News → the News index route
}

interface MarketingNav {
  destinations: MarketingNavDestination[];   // fixed order: Overview, News, Roadmap, Community
  wishlistCta: { label: "Wishlist"; href: string };
  active: MarketingNavDestination["id"] | null;   // derived from the current route (News only, v1)
}
```

- On `/news` and `/news/[slug]`, `active = "news"` (FR-005, AS2). On `/` the section anchors are
  scroll-links, not route-derived "active" state (single-page sections; spec AS4).
- `MarketingNav` is a **static constant** (no data source) — not fetched, not stored; distinct from
  `PostSummary`/`PostView` which come from `posts`.

---

## Assembly & trust boundary

`src/lib/posts.ts` (`import "server-only"`) is the **only** path a marketing view reads posts
through:

1. Every exported read (`getPublishedPosts`, `getPublishedPostBySlug`, `getLatestPosts`) constrains
   its query to `status='published' AND (publishedAt IS NOT NULL AND publishedAt <= now())` — in
   the query, not filtered after the fact (X3, SC-001). A slug that resolves to a `draft` or
   future-dated row returns "not found", identical to an unknown slug (FR-013).
2. `src/lib/post-view.ts` maps the raw rows to `PostSummary`/`PostView` — `toBadge` (the table
   above), excerpt/image fallback, byline derivation (`authorId` null ⇒ a studio/system byline),
   read-time estimate.
3. `src/lib/markdown.tsx` renders `PostView.bodyHtml` from `posts.body` through the safe
   `react-markdown` + `remark-gfm` pipeline (raw HTML off) — the article, the Home teaser excerpt
   derivation, and the RSS feed summary all go through the same renderer/excerpt logic, never
   `dangerouslySetInnerHTML` of unsanitized input (FR-012, SC-003; see
   [contracts/post-view.md](./contracts/post-view.md) §3).
4. `src/lib/revalidate.ts` defines the cache tags (`posts`, `post:{slug}`) these reads are tagged
   with — the F11↔F12 seam (research B1) — documented in
   [contracts/routes.md](./contracts/routes.md).

No marketing component, page, or SEO surface (`sitemap.ts`, `robots.ts`, `feed.xml/route.ts`)
queries `posts` directly — all of them call `src/lib/posts.ts` (FR-015).

## Entity relationship summary

```
posts (Feature 7, status/publishedAt-filtered) ──read-layer──> src/lib/posts.ts (published-only)
                                                                       │
                                                                       ▼
                                                          src/lib/post-view.ts (pure mapping)
                                                          ├─> PostSummary[]  → News index, Home teaser, sitemap, feed
                                                          └─> PostView       → Article page (adds bodyHtml, metadata)

MarketingNav { destinations[], wishlistCta, active }  ──rendered-as──> marketing-nav.tsx
                                                                        (composes Feature 3 primitives)

# No new tables. PostSummary/PostView/MarketingNav are transient, server-assembled projections.
```
