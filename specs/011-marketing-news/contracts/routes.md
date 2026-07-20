# Contract: Route Map + Rendering / Metadata / Revalidation

**Feature**: `011-marketing-news` | **Spec**: [../spec.md](../spec.md) | **Plan**:
[../plan.md](../plan.md) | **Research**: [../research.md](../research.md)

The public route map for the marketing site, and — per route — its rendering strategy,
its metadata contract, and the cache tags it reads under (the F11↔F12 revalidation seam this
feature **defines**; research B1). Every route reads `posts` **only** through
[contracts/post-view.md](./post-view.md)'s `src/lib/posts.ts`.

---

## 1. Route map

| Route | File | Rendering | Reads |
|---|---|---|---|
| `/` | `app/(marketing)/page.tsx` | static + ISR | `getLatestPosts(N)` (teaser) |
| `/news` | `app/(marketing)/news/page.tsx` | static + ISR | `getPublishedPosts({ limit, offset, type })` |
| `/news/[slug]` | `app/(marketing)/news/[slug]/page.tsx` | static (`generateStaticParams`) + `dynamicParams=true` + ISR | `getPublishedPostBySlug(slug)` |
| *(unknown/draft slug)* | `app/(marketing)/not-found.tsx` | static | — (404, no query) |
| `/sitemap.xml` | `app/sitemap.ts` | ISR (tagged `posts`) | `getPublishedSlugs()` / `getPublishedPosts()` |
| `/robots.txt` | `app/robots.ts` | static | — |
| RSS/Atom feed | `app/feed.xml/route.ts` | ISR (tagged `posts`) | `getPublishedPosts({ limit: <feedCap> })` |
| shell (every marketing route) | `app/(marketing)/layout.tsx` | static | — (MarketingNav is a static constant, data-model) |

All marketing routes live under the `app/(marketing)/` route group (one shell layout, research X1);
none is `force-dynamic` (research A1).

---

## 2. Per-route rendering contract

### `/` — Home

- `export const revalidate = <window>` (time-based backstop; research A1) — no `generateStaticParams`
  (single route).
- `metadata` (static export): title, description (the one-line pitch), `openGraph` (title/description/
  default key-art image).
- Latest-news teaser reads `getLatestPosts(N)`, tagged `posts` (revalidates when any post publishes).
- With zero published posts, the teaser renders its placeholder/hidden state (spec edge case) — the
  page itself is never empty (P1/P2 pillars + CTAs always render).

### `/news` — News index

- `export const revalidate = <window>`; reads `getPublishedPosts`, tagged `posts`.
- `searchParams` (`page`, `type`) are **validated/clamped** before use (unknown `type` → no filter;
  out-of-range `page` → clamped) — Principle II, mirroring [Ladder's pattern](../../009-ladder/data-model.md).
- `metadata` (static export): title "News", description, `openGraph`.
- Empty published set → the graceful empty state (FR-009), not a broken layout.

### `/news/[slug]` — Article

- `generateStaticParams()` → `getPublishedSlugs()` (build-time prerender of the known set).
- `export const dynamicParams = true` (the default, kept explicit) — a slug published *after* the
  last build renders on first request, then is ISR-cached (research A2, SC-007).
- `export const revalidate = <window>`.
- `params` is a **Promise** in Next.js 16 — `await params` before resolving the slug (research A2).
- `generateMetadata({ params })`: `await getPublishedPostBySlug(slug)`; if `null` → the route itself
  resolves to 404 (below), so `generateMetadata` only runs for a real published post. Builds `title`
  (post title), `description` (excerpt), `openGraph` (title/description/url/image =
  `PostView.ogImage`), and `alternates.canonical`.
- If `getPublishedPostBySlug(slug)` returns `null` (unknown OR draft OR future-dated), the page calls
  `notFound()` → renders `app/(marketing)/not-found.tsx` with HTTP **404** (FR-013, SC-004). This is
  the **only** branch point — no separate "is it a draft" check, because the read layer already
  collapsed that distinction (contracts/post-view.md §1).
- Tagged `post:{slug}` (this article) **and** `posts` (so it reflects a metadata/body edit and stays
  consistent with the index's view of "does this post exist").

### `app/sitemap.ts`

- Returns `{ url, lastModified }` for `/`, `/news`, and each entry from `getPublishedPosts()`
  (`lastModified` = the post's `updatedAt`); excludes anything not published (SC-001, via the read
  layer). Tagged `posts`.

### `app/robots.ts`

- Allows indexing of all public marketing routes; disallows none (no admin/app routes exist under
  this route group); `sitemap: <origin>/sitemap.xml`.

### `app/feed.xml/route.ts`

- A route handler returning RSS 2.0 (or Atom) XML: `getPublishedPosts({ limit: <feedCap> })` mapped
  to `title`/`link`/`pubDate`/`description` (the post's excerpt) per item, newest first. Tagged
  `posts`. Advertised via `alternates.types['application/rss+xml']` in the root/marketing metadata
  (research D3).

### `app/(marketing)/not-found.tsx`

- The marketing 404 — static, no data read. Rendered for both an unknown route under `(marketing)`
  and an unknown/draft article slug (`notFound()` call above).

### `app/(marketing)/layout.tsx` — the shell

- Renders `MarketingNav` (a static constant, data-model — not fetched) + `<MarketingFooter>` around
  `children`. No data read of its own; `active` destination is derived from `usePathname()` in the
  client leaf `marketing-nav.tsx` (FR-005).

### `app/layout.tsx` (root — light edit)

- Sets `metadataBase: new URL(<production origin>)` so every route's relative `openGraph.images`
  resolve to absolute URLs (research D1, SC-006). This is the **one** shared prerequisite every
  other route's metadata contract depends on — implemented once, in Foundational.

---

## 3. The F11↔F12 revalidation seam (research B1/B2, FR-019)

Owned and **defined** here; **called** by Feature 12 (and the code-push/balance-edit auto-post
triggers) on publish — never the reverse.

```ts
// src/lib/revalidate.ts
const POSTS_TAG = "posts";                          // any list/index/teaser/sitemap/feed read
const postTag = (slug: string) => `post:${slug}`;    // a single article

// Called by Feature 12 (or the code-push/balance-edit trigger) after a `posts` row is published
// or a published post's slug/body/metadata changes. F12 supplies the slug; this feature owns
// the tag names and the revalidation call.
revalidatePostsPublish(slug: string): Promise<void>;
// Implementation: revalidateTag(POSTS_TAG) + revalidateTag(postTag(slug))
// (or, until tag-based data caching is wired: revalidatePath('/news') +
//  revalidatePath(`/news/${slug}`, 'page') + revalidatePath('/sitemap.xml'))
```

- **`revalidateTag`, not `updateTag`** (research B2) — SWR semantics: the public reader tolerates a
  brief stale-then-fresh window; `updateTag` (read-your-own-writes) is a Feature 12-side concern for
  its own admin preview, not this feature's public read.
- **Optional HTTP entry** `app/api/revalidate/route.ts` (or a shared Server Action) wraps
  `revalidatePostsPublish` for Feature 12 to call cross-module; exact transport (direct import vs.
  HTTP) is an F11↔F12 integration detail, not a contract change either side depends on.
- **Backstop**: the `revalidate = <window>` time-based setting on every route means freshness
  (SC-007) survives even if this hook is never wired or is missed on a given publish.

---

## Contract guarantees

1. **No `force-dynamic` anywhere** — every route is static-first with ISR; the DB is not hit on
   every request (research A1, plan Performance Goals).
2. **A new post is visible without redeploy** — via `dynamicParams` (new article), the `posts` tag
   revalidation (index/sitemap/feed), and the time-based backstop, together (SC-007).
3. **404, not 500 or 200** — an unknown or draft/future slug resolves through exactly one branch
   (`getPublishedPostBySlug → null → notFound()`) to HTTP 404 (SC-004).
4. **Metadata is non-empty everywhere** — every route in §1 exports `metadata`/`generateMetadata`
   with `title`+description (+ `openGraph` where applicable); `metadataBase` is set once, root-level
   (SC-006).
5. **One-way dependency** — Feature 12 calls `revalidatePostsPublish`; this feature never imports or
   depends on Feature 12 (research B1).
