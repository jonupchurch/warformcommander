# Research: Marketing Site — Home + News Index + Article Template

**Feature**: `011-marketing-news` | **Date**: 2026-07-19 | **Plan**: [plan.md](./plan.md)

Resolves the technical unknowns behind a **public, SEO-friendly, both-orientation, read-only**
marketing site on **Next.js 16** that renders the unified `posts` feed (Feature 7) and stays fresh
as posts publish (including **auto-posted** devlog/balance entries from Feature 12) **without a
redeploy**. Format per decision: **Decision / Rationale / Alternatives considered**, sources cited
inline. The unknowns cluster into four workstreams — **(A) rendering & freshness strategy**,
**(B) the F11↔F12 revalidation seam**, **(C) the safe markdown pipeline**, and **(D) SEO / OG /
sitemap / RSS** — largely independent, all grounded in the three committed mockups
([`reference/Warform Commander Home.dc.html`](../../reference/Warform%20Commander%20Home.dc.html),
[`News Wireframe`](../../reference/Warform%20Commander%20News%20Wireframe.dc.html),
[`Content Page`](../../reference/Warform%20Commander%20Content%20Page.dc.html)).

---

## Workstream A — Rendering & freshness strategy (SC-005, SC-007)

The requirement: marketing pages must be fast (CDN-delivered), SEO-crawlable (server-rendered
HTML), and **fresh** — a newly published post appears in the index, its article, the sitemap, and
the feed **without a full rebuild** (SC-007).

### A1. Overall model → **static-first (SSG) + ISR, not `force-dynamic`**

- **Decision**: Prerender Home, the News index, and article pages **statically**, and keep them
  fresh with **Incremental Static Regeneration** — a time-based revalidation window plus
  **on-demand revalidation** (Workstream B). Do **not** mark segments `force-dynamic`.
- **Rationale**: ISR "serves a cached static response first; when stale (time-based or on-demand),
  the next request still gets the cached response and Next.js regenerates in the background" — the
  standard blog/marketing pattern that keeps CDN performance while staying current. `force-dynamic`
  would hit the DB on every request and forfeit static delivery, which the mostly-static marketing
  content doesn't need. Caching must be an **explicit, understood** choice, not a `force-dynamic`
  band-aid ([`stacks/nextjs.md`](../../stacks/nextjs.md)).
- **Alternatives considered**: *Fully dynamic (SSR every request)* — rejected: needless DB load,
  no CDN benefit, worse TTFB for content that changes a few times a day. *Fully static (build-time
  only)* — rejected: fails SC-007 (a new post would need a redeploy).
- Sources: [Next.js — Incremental Static Regeneration](https://nextjs.org/docs/app/guides/incremental-static-regeneration),
  [Next.js — How Revalidation Works](https://nextjs.org/docs/app/guides/how-revalidation-works).

### A2. Article slugs → **`generateStaticParams` + `dynamicParams = true`**

- **Decision**: `app/(marketing)/news/[slug]/page.tsx` exports `generateStaticParams()` returning
  the currently-published slugs (prebuilt at build time) and keeps **`dynamicParams = true`** (the
  default) so a slug **not** in that set renders **on first request** and is then cached.
- **Rationale**: "`generateStaticParams` statically generates routes at build time instead of
  on-demand"; with `dynamicParams = true`, "non-pre-generated paths are handled dynamically" — so a
  post published *after* the last build still resolves (renders on demand, then ISR-caches),
  satisfying SC-007 for brand-new articles. In Next.js 16, `params` is a **Promise** and must be
  `await`ed.
- **Alternatives considered**: *`dynamicParams = false`* — rejected: a new post's slug would 404
  until a rebuild (fails SC-007). *No `generateStaticParams`* — acceptable but forgoes build-time
  prerender of known posts (slower first hit); we prebuild the known set and let the rest fall
  through.
- Sources: [Next.js — generateStaticParams](https://nextjs.org/docs/app/api-reference/functions/generate-static-params),
  [Next.js — Dynamic Segments (`dynamicParams`)](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes).

### A3. Cache Components (`use cache`) vs classic segment ISR → **classic ISR now; `use cache` is the forward path**

- **Decision**: Use **classic segment-level ISR** (`export const revalidate = <window>` +
  `generateStaticParams`) plus **tagged data caching over the DB read** as the primary mechanism,
  and treat Next.js 16's **Cache Components** (`use cache` + `cacheTag` + `revalidateTag`) as the
  drop-in upgrade path — **not** a prerequisite this feature forces on the repo.
- **Rationale**: Cache Components (Next 16) "flip the default so data is dynamic unless cached with
  a `use cache` directive," with `cacheLife` for lifetime and `cacheTag` for tag-based
  invalidation — a clean fit for tagging DB reads (our `posts` reads are Drizzle queries, **not**
  `fetch`, so `fetch`-level `next.tags` doesn't apply). **But** enabling `cacheComponents` is a
  **repo-wide** config change that also governs Feature 3's shell and every other route; forcing it
  from a read-only marketing feature is scope the feature shouldn't own. So we tag the **posts
  read layer** (Workstream B) in a way that works **today** and is one-line-swappable to
  `use cache`. If/when the repo adopts Cache Components repo-wide, the read layer's tag calls
  become `cacheTag('posts', 'post:'+slug)` inside a `use cache` scope with a `cacheLife` profile —
  no change to callers.
- **Alternatives considered**: *Enable `cacheComponents` repo-wide as part of F11* — rejected:
  over-reaches F11's scope (Principle IV) and couples a marketing feature to a global rendering-
  model decision. *No data-cache tagging at all (segment `revalidate` only)* — workable for
  freshness but only path-addressable; tag-addressable caching (B) gives F12 a precise, cheap
  invalidation seam.
- Sources: [Next.js 16 blog](https://nextjs.org/blog/next-16),
  [Next.js — Migrating to Cache Components](https://nextjs.org/docs/app/guides/migrating-to-cache-components),
  [Next.js — Revalidating](https://nextjs.org/docs/app/getting-started/revalidating).

---

## Workstream B — The F11↔F12 revalidation seam (SC-007, FR-019)

The requirement: when Feature 12 (or an auto-post trigger) **publishes** a post, the change must
surface across F11's index, article, sitemap, and feed **without a redeploy**, precisely (don't
over-invalidate) and with the dependency pointing the right way.

### B1. Tagging → **F11 owns the tag/path vocabulary; F12 calls it**

- **Decision**: F11 **defines** the cache tags **`posts`** (any list/index/teaser/sitemap/feed
  read) and **`post:{slug}`** (a single article), applied in the `src/lib/posts.ts` read layer.
  F11 exposes a tiny **revalidation entry point** (`src/lib/revalidate.ts` + optionally
  `app/api/revalidate/route.ts`) that maps a publish event → `revalidateTag('posts')` +
  `revalidateTag('post:'+slug)` (or, until tag caching is wired, `revalidatePath('/news')` +
  `revalidatePath('/news/'+slug, 'page')` + `revalidatePath('/sitemap.xml')`). **Feature 12** (and
  the code-push / balance-edit auto-post triggers) **calls** this seam on publish.
- **Rationale**: The reader owns its cache contract; making F11 the definer of `posts` /
  `post:{slug}` keeps a **one-way dependency** (F12 → F11's seam), so F12 doesn't need to know
  F11's route structure. Next.js on-demand revalidation is exactly this: "tag cached data, then
  `revalidateTag('...')` when the source changes" — invalidate entries, regenerate on next request.
  Tag-based invalidation is "more precise than path-based and avoids over-invalidating."
- **Alternatives considered**: *F12 revalidates F11's literal paths* — rejected: couples F12 to
  F11's URL layout; a route rename silently breaks freshness. *Poll/short TTL only* — rejected:
  either stale (long TTL) or wasteful (short TTL); on-demand is precise and cheap. (A short
  time-based window is still kept as a **backstop** so freshness survives even if the hook is
  missed — belt and suspenders for SC-007.)
- Sources: [Next.js — Revalidating (`revalidateTag`/`revalidatePath`)](https://nextjs.org/docs/app/getting-started/revalidating),
  [Next.js — How Revalidation Works](https://nextjs.org/docs/app/guides/how-revalidation-works).

### B2. `revalidateTag` vs `updateTag` (Next 16) → **`revalidateTag` (SWR) for publishes; `updateTag` reserved for read-your-write**

- **Decision**: For a publish (an admin or an auto-trigger changing `posts` out-of-band from the
  reader), the seam uses **`revalidateTag(tag, <cacheLife>)`** — stale-while-revalidate: the CDN
  serves the current page immediately while the fresh one regenerates in the background. Reserve
  **`updateTag`** for the (F12-side) case where an admin must **immediately** see their own edit in
  the same Server Action (read-your-own-writes) — that's a Feature 12 concern, not F11's public
  read.
- **Rationale**: Next 16 separates the two: "`updateTag` refreshes cached content incrementally for
  read-your-own-writes (Server-Action-only); `revalidateTag` performs SWR invalidation — stale
  served immediately, fresh loads in background — ideal for content where a slight update delay is
  acceptable, like blog posts." Public marketing readers tolerate SWR; the admin's own console can
  use `updateTag` if instant self-consistency is wanted. (Under **classic** ISR without Cache
  Components, `revalidateTag`/`revalidatePath` already provide the public-facing SWR behavior.)
- **Alternatives considered**: *`updateTag` for public publishes* — unnecessary (blocks the next
  request for freshness the public doesn't need instantly) and Server-Action-only. *No SWR (hard
  purge)* — a brief regeneration gap could show a 1-request delay; SWR avoids any stall.
- Sources: [Next.js 16 blog](https://nextjs.org/blog/next-16),
  [Advanced Cache Management in Next.js 16: `updateTag` and `revalidateTag`](https://dev.to/mericcintosun/advanced-cache-management-in-nextjs-16-updatetag-and-revalidatetag-50j2).

---

## Workstream C — The safe markdown pipeline (SC-003, FR-012, Principle II)

The requirement: render `posts.body` (markdown, authored via Feature 12 — admin editorial +
auto-posts) to HTML **safely** in a React Server Component, with zero XSS survivors even if a body
contains a raw-HTML/script payload.

### C1. Renderer → **`react-markdown` + `remark-gfm`, raw HTML disabled**

- **Decision**: Render markdown with **`react-markdown`** (+ **`remark-gfm`** for tables,
  strikethrough, task lists, autolinks) in a Server Component. Keep raw HTML **off** (its default).
  Do **not** pass unsanitized HTML to `dangerouslySetInnerHTML`.
- **Rationale**: `react-markdown` "builds React elements from a syntax tree and **never** uses
  `dangerouslySetInnerHTML`; raw HTML in the source is **stripped by default**" — safe-by-default,
  and it "works in server components: parsed and converted to React elements on the server, HTML
  sent to the client, no client JS needed for static content." That is precisely our case
  (server-rendered article body, no interactivity). It sits at the center of the unified/remark
  ecosystem (Docusaurus/Astro/Gatsby), so it is well-supported and low-risk.
- **Alternatives considered**: *MDX (`next-mdx-remote` / `@next/mdx`)* — rejected: MDX **executes
  arbitrary JSX**, an unnecessary code-execution/XSS surface for DB-authored content, and posts are
  plain markdown, not components. *`marked`/`markdown-it` → `dangerouslySetInnerHTML`* — rejected:
  reintroduces the raw-HTML injection surface Principle II forbids unless separately sanitized.
- Sources: [react-markdown (remarkjs) — README/security](https://github.com/remarkjs/react-markdown),
  [Strapi — React Markdown Guide: Security & Styling](https://strapi.io/blog/react-markdown-complete-guide-security-styling).

### C2. If raw HTML is ever needed → **`rehype-raw` + `rehype-sanitize` (allowlist)**

- **Decision**: Should a future post require embedded raw HTML (e.g. an iframe embed), enable it
  **only** behind `rehype-raw` **followed by `rehype-sanitize`** with an explicit allowlist — never
  raw HTML without the sanitizer. v1 does not enable raw HTML.
- **Rationale**: "Using `remark-rehype`/raw HTML can open an XSS attack via embedded properties and
  `allowDangerousHtml`; use `rehype-sanitize` to make the tree safe" — a whitelist filter that
  "allows safe tags by default and strips `<script>`/`<iframe>`." Keeping this **documented but
  off** means the XSS test corpus (SC-003) can assert the default-stripping behavior now, and the
  sanitizer is the known extension point later.
- **Alternatives considered**: *Enable `rehype-raw` without `rehype-sanitize`* — rejected outright
  (documented XSS hole). *Blanket-allow all HTML* — rejected (Principle II).
- Sources: [react-markdown — appendix on security / `rehype-sanitize`](https://github.com/remarkjs/react-markdown),
  [remark-rehype (raw-HTML caveat)](https://github.com/remarkjs/remark-rehype).

---

## Workstream D — SEO / OpenGraph / sitemap / RSS (SC-006, FR-017/FR-018)

The requirement: every public page is crawlable + unfurlable; a sitemap enumerates the published
articles; robots permits crawling; an RSS feed publishes the news (the followable devlog).

### D1. Per-page metadata → **the Metadata API (`metadata` / `generateMetadata`) + `metadataBase`**

- **Decision**: Static pages (Home, News index) export a `metadata` object; the article exports
  **`generateMetadata({ params })`** building `title`, `description` (from `excerpt`), and
  `openGraph` (title/description/url/image) per post. Set **`metadataBase`** in the root layout so
  relative OG image paths resolve to absolute production URLs.
- **Rationale**: "Dynamic metadata depending on route params/external data is set by exporting
  `generateMetadata` returning a `Metadata` object"; "`metadataBase` is **required** when using
  relative `openGraph.images` — without it Next.js can't build the absolute URL social scrapers
  need." Use the metadata API, **not** manual `<head>` tags ([`stacks/nextjs.md`](../../stacks/nextjs.md)).
  OpenGraph is read by LinkedIn/Slack/Discord/Facebook/iMessage — the share targets a game devlog
  cares about.
- **Alternatives considered**: *Manual `<head>`/`next/head`* — rejected: not the App Router idiom;
  loses per-route merging. *No `metadataBase`* — rejected: relative OG images won't unfurl.
- Sources: [Next.js — generateMetadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata),
  [Next.js — Metadata and OG images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images).

### D2. Sitemap + robots → **`app/sitemap.ts` and `app/robots.ts` (file conventions)**

- **Decision**: `app/sitemap.ts` returns the entries for `/`, `/news`, and **each published
  article** (with `lastModified` = the post's `updatedAt`/`publishedAt`); `app/robots.ts` allows
  indexing of public routes and points at the sitemap URL. Both are tagged `posts` so a publish
  refreshes the sitemap (Workstream B).
- **Rationale**: "Drop `sitemap.ts` in `app/` and Next.js serves it at `/sitemap.xml`; same for
  `robots.ts` at `/robots.txt` — no physical file required." The sitemap reads the **same
  published-only** read layer, so drafts never leak into it (SC-001).
- **Alternatives considered**: *A static committed `sitemap.xml`* — rejected: can't reflect new
  posts without a redeploy (fails SC-007). *A route handler hand-building XML* — unnecessary; the
  file convention is simpler and typed.
- Sources: [Next.js — sitemap.ts](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap),
  [Next.js — robots.txt](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots).

### D3. RSS/Atom feed → **a route handler at `app/feed.xml/route.ts` reading the published posts**

- **Decision**: Serve an RSS 2.0 (or Atom) feed from a **route handler** (`app/feed.xml/route.ts`)
  that reads the published posts (newest first) via the read layer and emits `title`, `link`,
  `pubDate`, and `description`/summary per item; advertise it via `alternates.types`
  (`application/rss+xml`) in the root/marketing metadata.
- **Rationale**: "The recommended method is an API/route in `app/` that dynamically generates the
  feed"; the Metadata API's `alternates` "can include RSS via `types: { 'application/rss+xml': … }`"
  so readers and browsers discover it. This directly serves the project rule that **every code push
  auto-posts a devlog** — a followable changelog stream. A small, well-known feed library or a
  hand-rolled template is fine; the content is the published `posts` projection.
- **Alternatives considered**: *No feed* — rejected: the devlog/changelog is explicitly meant to be
  followable (§16.2). *`sitemap`-only* — rejected: sitemaps aren't a subscription surface.
- Sources: [Next.js — generateMetadata (`alternates` RSS)](https://nextjs.org/docs/app/api-reference/functions/generate-metadata),
  [Next.js — Metadata and OG images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images).

---

## Cross-cutting decisions

### X1. Route grouping → **`app/(marketing)/` group with one shell layout; replace the placeholder Home**

- **Decision**: All public pages live under `app/(marketing)/` sharing `layout.tsx` (the marketing
  shell). The Feature 3 **placeholder `app/page.tsx`** ("real Home = Feature 11") is **removed** and
  replaced by `app/(marketing)/page.tsx` (route groups don't affect the URL; both resolving to `/`
  would collide).
- **Rationale**: Mirrors Feature 3's `app/(app)/layout.tsx` authenticated-shell pattern — one
  layout, every child inherits the chrome (Principle III). Keeps the **marketing** shell cleanly
  separate from the **authenticated** shell (Feature 3 data-model draws exactly this line).
- Sources: [Next.js — Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups); Feature 3
  [`003-app-shell/plan.md`](../003-app-shell/plan.md) & [`data-model.md`](../003-app-shell/data-model.md).

### X2. Category/badge taxonomy → **map `posts.type` → display badge/tone; editorial sub-category from `metadata`**

- **Decision**: The mockups' display categories (DEVLOG / DESIGN / TECH / COMMUNITY / BALANCE) do
  **not** map 1:1 to the persistence `type` enum (editorial/balance/devlog/changelog). The reader
  maps `type` → a badge label + a Feature 3 `Chip` **tone**; for `editorial` posts it reads an
  optional finer category from **`metadata.category`** (DESIGN/TECH/COMMUNITY), falling back to
  "NEWS". A **featured** item = most-recent published unless `metadata.featured` overrides.
- **Rationale**: Keeps the persistence schema (Feature 7, **P8**) authoritative while honoring the
  mockups' richer editorial taxonomy without a schema change — extra editorial nuance rides in the
  existing `metadata` jsonb (Feature 7 designed `metadata` for exactly this kind of structured
  extra). See [data-model.md](./data-model.md) for the mapping table.
- **Alternatives considered**: *Add category columns to `posts`* — rejected: F11 is read-only and
  can't (and shouldn't) migrate Feature 7's schema; `metadata` already carries it.

### X3. Read-layer as the trust boundary → **published-only, in the query, returning view-models**

- **Decision**: `src/lib/posts.ts` is the **only** path the marketing views read posts through, and
  it constrains **every** query to `status='published' AND publishedAt <= now`, returning typed
  `PostSummary`/`PostView` view-models (never raw rows). Article/sitemap/feed all go through it.
- **Rationale**: Centralizing the filter in the data layer (not the UI) means a draft/future post
  **cannot** leak through any surface (SC-001, Principle II) — a single, testable choke point, the
  same posture Feature 7 mandates for its read model. Returning view-models keeps markdown
  rendering + badge mapping consistent and testable.
- Sources: Feature 7 [`007-accounts-persistence/data-model.md` → `posts` / trust-boundary rules](../007-accounts-persistence/data-model.md);
  [`stacks/nextjs.md`](../../stacks/nextjs.md) (validate at boundaries; server-only reads).

---

## Summary of decisions

| # | Decision | Primary driver |
|---|---|---|
| A1 | Static-first + ISR (no `force-dynamic`) | SC-007 freshness + CDN perf |
| A2 | `generateStaticParams` + `dynamicParams=true` (await `params`) | new-post articles without rebuild |
| A3 | Classic ISR now; `use cache`/Cache Components as the swap-in upgrade | freshness without repo-wide coupling (Principle IV) |
| B1 | F11 owns tags `posts` + `post:{slug}`; F12 calls the seam | precise, one-way F12→F11 dependency |
| B2 | `revalidateTag` (SWR) for publishes; `updateTag` reserved for F12 read-your-write | public tolerates SWR; no stall |
| C1 | `react-markdown` + `remark-gfm`, raw HTML off | safe-by-default RSC render (SC-003) |
| C2 | `rehype-raw` + `rehype-sanitize` only if raw HTML ever enabled (off in v1) | documented, allowlisted escape hatch |
| D1 | Metadata API + `generateMetadata` + `metadataBase` | per-page/-post SEO + OG unfurl (SC-006) |
| D2 | `app/sitemap.ts` + `app/robots.ts` (published-only) | crawlable, draft-free sitemap |
| D3 | RSS feed route handler + `alternates` advertise | followable devlog/changelog (§16.2) |
| X1 | `app/(marketing)/` group; replace placeholder Home | one marketing shell; clean split from app shell |
| X2 | `type`→badge/tone map; editorial sub-category from `metadata` | mockup taxonomy without schema churn (P8) |
| X3 | `src/lib/posts.ts` published-only read layer → view-models | single testable trust boundary (SC-001, Principle II) |
