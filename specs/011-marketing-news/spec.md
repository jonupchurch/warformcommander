# Feature Specification: Marketing Site — Home + News Index + Article Template

**Feature Branch**: `011-marketing-news`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Marketing site (Home + News index + article template) — the public,
unauthenticated face of Warform Commander: the Home/landing page (pitch, pillars, the anti-P2W
promise, calls to action), the News index (a list of published `posts` — editorial + auto
balance/devlog/changelog — from Feature 7), and the article/Content-Page template (a single post
rendered from markdown, by slug), plus the marketing shell/nav (Overview · News · Roadmap ·
Community). It **reads** the unified `posts` table; it does not author posts."

## Overview

This feature is the **public marketing site** — the first thing anyone who isn't logged in sees.
It has three surfaces plus the chrome that frames them:

1. **Home / landing** (`/`) — the pitch, the four design pillars, the **non-P2W brand promise**
   ("Skill lives in the plan — never the wallet"), a roadmap snapshot, a latest-news teaser, and
   the calls to action (Wishlist / How to Play / Join the community). Design doc §1, §2; pillar
   **P1**.
2. **News index** (`/news`) — the unified news feed: a list of **published** `posts` ordered by
   publish time, mixing hand-written **editorial** posts with **auto-posted** `balance`,
   `devlog`, and `changelog` entries. This is the reader half of the "one unified posts system"
   (§16.2): Home → News index → article.
3. **Article / Content-Page** (`/news/[slug]`) — a single post rendered from its markdown body by
   slug, with title, meta line, lead/inline imagery, and social-share metadata.

Plus the **marketing shell** — the header/nav (Overview · News · Roadmap · Community + Wishlist
CTA) and footer that every marketing page shares, composed from Feature 3's tokens, brand marks
(`Logo`, `Wordmark`), and primitives (`Button`, `Panel`, `SectionLabel`, `Chip`, `GridBackdrop`).
Feature 3 deliberately **scoped the marketing-shell nav content to this feature**
([`003-app-shell/data-model.md` → Marketing shell](../003-app-shell/data-model.md)); this feature
owns it.

**What this feature is, precisely: READ + present.** It reads the unified `posts` table
([`007-accounts-persistence/data-model.md` → `posts`](../007-accounts-persistence/data-model.md))
via `posts WHERE status='published' ORDER BY publishedAt DESC` and renders it. It **does not
author, edit, or auto-publish** posts — that is Feature 12 (admin console) plus the code-push /
balance-edit auto-post triggers. It is public, unauthenticated, SEO-friendly, and — per **P7** —
first-class in both mobile portrait and desktop landscape.

> **Authoring-ownership reconciliation.** Feature 7's spec loosely attributes "editorial
> (hand-written, Feature 11)" *authoring* to this feature; the authoritative split — reaffirmed
> here and in [`007-accounts-persistence/data-model.md`](../007-accounts-persistence/data-model.md)
> ("Feature 11 owns the News-index/article UI, Feature 12 owns the admin authoring + auto-post
> triggers") — is that **all writing to `posts` (editorial included) happens through Feature 12's
> admin surface**, and Feature 11 is the **public read/presentation** layer only. See Assumptions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Home page sells the game and its non-P2W promise (Priority: P1) 🎯 MVP

A prospective player lands on `/` and, in one scroll, understands what Warform Commander *is* (a
sci-fi tactics wargame where you plan an army and watch it auto-resolve), *why it's different*
(the four pillars, headlined by **non-pay-to-win by construction**), where it's headed (the
roadmap snapshot), and what to do next (Wishlist / How to Play / Join the community). The
anti-P2W brand line — **"Skill lives in the plan — never the wallet."** — is present and
prominent (constitution **P1**).

**Why this priority**: The landing page is the product's front door and its single most-seen
surface. Even with no news yet and no article template, a Home page that communicates the pitch
and the promise with working CTAs is a complete, shippable, demonstrable marketing site — the MVP.

**Independent Test**: Load `/` with an empty `posts` table. Assert the hero pitch, the four
pillars (including the non-P2W pillar), the brand-promise line, the roadmap snapshot, and all CTAs
render; assert the page renders with **no horizontal overflow at 360px portrait and 1440px
landscape**; assert it emits page `<title>`/description/OpenGraph metadata.

**Acceptance Scenarios**:

1. **Given** the marketing site is deployed, **When** a visitor loads `/`, **Then** the hero
   shows the one-line pitch, the exact brand promise "Skill lives in the plan — never the wallet",
   and a primary CTA.
2. **Given** the Home page, **When** it renders, **Then** the four design pillars appear, one of
   which explicitly communicates **non-P2W by design** (P1), and the roadmap snapshot shows the
   "In v1 / Later" split (§16.1).
3. **Given** the Home page, **When** viewed at 360px portrait and again at 1440px landscape,
   **Then** every section is legible and usable in both, with no clipped content and no horizontal
   scroll (P7).
4. **Given** the Home page, **When** a crawler or link-unfurler requests it, **Then** it receives a
   descriptive `<title>`, meta description, and OpenGraph tags.

---

### User Story 2 - The marketing shell frames every page in both orientations (Priority: P1)

Every marketing page shares a **header** (Warform mark + wordmark, nav: Overview · News · Roadmap
· Community, and a Wishlist CTA) and a **footer** (brand blurb, Game / Community / More link
columns, copyright). The nav is first-class in **both** portrait and landscape (**P7**) — not a
desktop layout grudgingly shrunk. Overview / Roadmap / Community resolve to Home-page sections;
News resolves to `/news`.

**Why this priority**: The shell is the chrome the Home page and every future marketing surface
render inside; it carries the brand and the primary navigation. It is co-delivered with US1 as the
first shippable slice (Home *is* the shell + Home content), and it is where P7 shows up for
marketing.

**Independent Test**: Render the shell on `/`, `/news`, and an article route; assert the nav
destinations and Wishlist CTA are present and link correctly (section anchors for Overview/Roadmap/
Community, `/news` for News); assert the header and footer render usably at 360px portrait and
1440px landscape; assert the active destination is indicated on `/news`.

**Acceptance Scenarios**:

1. **Given** any marketing page, **When** it renders, **Then** the header shows the Warform
   `Logo` + `Wordmark`, the four nav destinations, and the Wishlist CTA, and the footer shows the
   brand blurb + link columns.
2. **Given** the News index page, **When** the shell renders, **Then** the "News" destination is
   shown as active.
3. **Given** the header/nav at 360px portrait, **When** it renders, **Then** the brand and
   navigation are reachable and legible with no horizontal overflow (a compact/collapsed nav
   treatment is acceptable, but both orientations are designed *for*).
4. **Given** the "Overview"/"Roadmap"/"Community" nav items, **When** clicked from Home, **Then**
   they scroll to the corresponding Home section; **When** on `/news`, **Then** they route to the
   Home page's corresponding section.

---

### User Story 3 - The News index lists published posts, newest first (Priority: P2)

A visitor opens `/news` and sees the published news feed: a **featured** lead post plus a grid of
recent posts, each with a **type badge** (DEVLOG / BALANCE / editorial category), a date, a
title, and an excerpt, each linking to its article. Posts are ordered **newest first** by publish
time. Only **published** posts appear — drafts never do. Auto-posted `balance` / `devlog` /
`changelog` entries render alongside editorial posts as first-class feed items.

**Why this priority**: The News index is the hub of the unified posts system and the destination
the "auto-post a devlog on every code push" project rule feeds into. It depends on the shell (US2)
and the read layer, but is independently testable against seeded posts.

**Independent Test**: Seed the `posts` table with a mix of `published` and `draft` posts of every
`type`; load `/news`; assert only published posts appear, ordered by `publishedAt` descending;
assert each auto-posted (`balance`/`devlog`/`changelog`) post renders with its type badge and date;
assert a `draft` post is absent; assert the empty state renders when there are zero published posts.

**Acceptance Scenarios**:

1. **Given** posts of mixed status, **When** `/news` loads, **Then** exactly the `status =
   'published'` posts are listed, ordered by `publishedAt` descending, and no `draft` is shown.
2. **Given** an auto-posted `balance` post (null author, `metadata` carrying the balance delta),
   **When** it appears in the index, **Then** it renders with a BALANCE badge, its date, title,
   and excerpt — indistinguishable in reliability from an editorial post.
3. **Given** zero published posts, **When** `/news` loads, **Then** a graceful empty state renders
   ("No dispatches yet") rather than a broken or blank layout.
4. **Given** more published posts than one page holds, **When** `/news` loads, **Then** the feed
   paginates (newest page first) and older posts are reachable.
5. **Given** the index, **When** viewed at 360px portrait and 1440px landscape, **Then** the
   featured post and grid reflow to a single readable column in portrait and the multi-column grid
   in landscape (P7).

---

### User Story 4 - An article renders a post from markdown by slug (Priority: P2)

A visitor opens `/news/<slug>` and reads a single published post: its eyebrow/type, title, meta
line (author-or-studio · updated date · read time), lead image, and the **body rendered safely
from markdown** (headings, paragraphs, lists, blockquotes/pull-quotes, inline images, links). An
unknown or unpublished slug returns a **404**. The same template renders every post kind —
editorial long-reads and terse auto-posted `changelog`/`devlog` entries alike.

**Why this priority**: The article template is what makes every News-index item a real
destination and is the second half of the "Home → News → article" system. It depends on the read
layer and the markdown pipeline; independently testable per slug.

**Independent Test**: Seed a published post with a markdown body exercising headings, lists,
blockquotes, links, and an image; request `/news/<slug>`; assert the rendered HTML contains the
expected structure and that **no script/`onerror`/`javascript:` payload in the markdown survives**
sanitization; request an unknown slug and a `draft` slug and assert both 404; request a very long
post and assert it renders without layout breakage.

**Acceptance Scenarios**:

1. **Given** a published post with a markdown body, **When** `/news/<slug>` loads, **Then** the
   title, meta line, and body render, with markdown converted to semantic HTML (headings,
   paragraphs, lists, blockquotes, links, images).
2. **Given** a slug that does not exist **or** belongs to a `draft`/unpublished post, **When**
   requested, **Then** the route returns HTTP 404 with the marketing `not-found` page (a draft is
   never publicly reachable by guessing its slug).
3. **Given** a post whose markdown contains raw HTML with an XSS payload (`<script>`,
   `onerror=`, `javascript:` URL), **When** rendered, **Then** the payload is stripped/neutralized
   and does not execute.
4. **Given** an auto-posted `changelog`/`devlog` post (structured `metadata`, possibly no lead
   image), **When** its article renders, **Then** it renders cleanly with its type badge and any
   metadata (e.g. commit SHA, balance delta) surfaced, without requiring an image.
5. **Given** an article, **When** a link-unfurler requests it, **Then** `generateMetadata`
   produces a per-post `<title>`, description (from the excerpt), and OpenGraph tags (including an
   image).

---

### User Story 5 - The site is discoverable and shareable (SEO / OG / sitemap / RSS) (Priority: P3)

Search engines and social platforms can index and unfurl the site: every page emits appropriate
metadata; a **sitemap** enumerates the Home, News index, and every published article; a
**robots** policy permits crawling and points at the sitemap; and an **RSS/Atom feed** publishes
the news posts (so the live devlog/changelog is followable in a reader). A newly published post
appears in the index, its article route, the sitemap, and the feed **without a full redeploy**.

**Why this priority**: Discoverability compounds the marketing value but isn't required for the
first demonstrable slice; it layers on once the pages exist. Independently testable via the
metadata/sitemap/feed endpoints.

**Independent Test**: Request `/sitemap.xml`, `/robots.txt`, and the feed endpoint; assert the
sitemap lists `/`, `/news`, and each published article URL; assert robots allows crawling and
references the sitemap; assert the feed validates and lists published posts newest-first. Publish
a new post (simulate the Feature 12 revalidation call) and assert it appears in `/news`, its
article, the sitemap, and the feed without rebuilding.

**Acceptance Scenarios**:

1. **Given** the deployed site, **When** `/sitemap.xml` is requested, **Then** it lists `/`,
   `/news`, and one entry per published article (with `lastModified`), and excludes drafts.
2. **Given** the deployed site, **When** `/robots.txt` is requested, **Then** it permits indexing
   of public routes and references the sitemap URL.
3. **Given** the deployed site, **When** the RSS/Atom feed is requested, **Then** it returns a
   valid feed of published posts, newest first, each with title, link, publish date, and summary.
4. **Given** a post is newly published (Feature 12 fires the agreed revalidation), **When** the
   News index, article, sitemap, and feed are next requested, **Then** the new post is present —
   **no redeploy required**.

---

### Edge Cases

- **No posts yet / empty news**: `/news` renders a graceful empty state; the Home "latest news"
  teaser hides or shows a placeholder; the sitemap/feed contain the static routes and no article
  entries — no crashes.
- **A very long article** (or very long title/excerpt): the article template constrains measure
  and wraps; the index card truncates title/excerpt without overflow.
- **A draft post MUST NOT appear publicly**: never in the index, never in the teaser, never in the
  sitemap/feed, and its slug 404s — enforced in the read query (`status='published'`), not in the
  UI.
- **A post published with a future `publishedAt`** (scheduled): treated as not-yet-public
  (`publishedAt <= now`) so scheduling doesn't leak early. *(If Feature 12 never schedules ahead,
  this is a no-op guard.)*
- **An auto-posted balance/devlog post** with structured `metadata` and a **null author**:
  renders with a system/studio byline and its badge; the balance delta / commit SHA in `metadata`
  is surfaced legibly.
- **Unknown slug** or **malformed slug** → 404 (not a 500).
- **Both orientations**: every surface (hero, pillars, roadmap, news grid, article, header,
  footer) is designed for 360px portrait and 1440px landscape (P7).
- **Post with no excerpt / no image**: the index card and article degrade gracefully (excerpt
  derived from the body's first prose, a default OG/lead image used).
- **SEO metadata present**: each public page emits `<title>`, description, and OpenGraph tags;
  `metadataBase` is set so relative OG image paths resolve to absolute URLs.
- **Markdown with unsupported/raw HTML**: sanitized — safe subset rendered, dangerous nodes
  dropped.
- **Category taxonomy mismatch**: the mockups show display categories (DEVLOG / DESIGN / TECH /
  COMMUNITY) that don't map 1:1 to the persistence `type` enum (editorial / balance / devlog /
  changelog); the reader maps `type` → badge and reads an editorial sub-category from `metadata`
  (see data-model). An unrecognized category falls back to a neutral "NEWS" badge.

## Requirements *(mandatory)*

### Functional Requirements

**Home / landing (US1)**

- **FR-001**: The system MUST render a public Home page at `/` communicating the one-line pitch
  (§1), the four design pillars (§2) — including an explicit **non-P2W** pillar — and the brand
  promise **"Skill lives in the plan — never the wallet."** verbatim (constitution **P1**).
- **FR-002**: The Home page MUST present the primary calls to action (e.g. Wishlist, How to Play,
  Join the community) as accessible, keyboard-operable controls built from Feature 3's `Button`
  primitive.
- **FR-003**: The Home page MUST include a roadmap snapshot reflecting the v1 / backlog split
  (§16.1) and a **latest-news teaser** that reads the most recent published `posts` (degrading to
  a placeholder/hidden state when there are none).

**Marketing shell / nav (US2)**

- **FR-004**: The system MUST provide a marketing shell (header + footer) shared by every
  marketing route, composed from Feature 3 tokens, `Logo`, `Wordmark`, and primitives — referencing
  **semantic tokens only**, never raw brand hex (Feature 3 SC-002).
- **FR-005**: The header MUST render the marketing nav destinations **Overview · News · Roadmap ·
  Community** plus a **Wishlist** CTA; Overview/Roadmap/Community resolve to Home-page section
  anchors, News resolves to `/news`; the active destination is indicated on the News routes.
- **FR-006**: The marketing shell MUST be first-class in **both** mobile portrait and desktop
  landscape (**P7**) — no horizontal overflow, all nav reachable, in both orientations.

**News index (US3)**

- **FR-007**: The system MUST render `/news` listing **only** `posts` where `status='published'`
  (and `publishedAt <= now`), ordered by `publishedAt` **descending**, using the Feature 7
  `posts_published_idx (status, publishedAt)` read path.
- **FR-008**: The News index MUST render every published post kind — `editorial`, `balance`,
  `devlog`, `changelog` — as a feed item with a **type badge**, date, title, and excerpt, each
  linking to its article; a **featured** lead item is derived (most-recent published, or a
  `metadata.featured` override).
- **FR-009**: The News index MUST render a graceful **empty state** when there are no published
  posts, and MUST **paginate** when published posts exceed one page (newest page first).
- **FR-010**: The News index MAY support filtering by post category/type (the mockup's category
  chips), mapping the display categories to `posts.type` (+ `metadata.category` for editorial
  sub-categories); an unrecognized category falls back to "NEWS". *(Full-text search is a
  non-goal for v1 — see Assumptions.)*

**Article / Content-Page (US4)**

- **FR-011**: The system MUST render an article at `/news/[slug]` for a **published** post,
  resolving the post by its unique `slug`, showing eyebrow/type, title, meta line, optional lead
  image, and the body.
- **FR-012**: The system MUST render `posts.body` (markdown) to HTML through a **safe** pipeline
  that renders a supported markdown subset (headings, paragraphs, lists, blockquotes, links,
  images, code) and **strips/neutralizes** any embedded raw-HTML/script/`javascript:` payload
  (trust boundary — constitution Principle II), without `dangerouslySetInnerHTML` of unsanitized
  input.
- **FR-013**: The system MUST return an HTTP **404** (the marketing `not-found` page) for an
  unknown slug or a slug whose post is not `published` — a draft MUST NOT be publicly reachable by
  URL.
- **FR-014**: The article template MUST render every post kind, surfacing `metadata` where present
  (e.g. a `balance` post's stat delta, a `devlog`/`changelog` post's commit SHA) and degrading
  gracefully when a post has no image or excerpt.

**Read layer & trust boundary (Principle II, P6)**

- **FR-015**: All public reads MUST go through a **posts read/data-access layer** that constrains
  every query to `status='published'` (and `publishedAt <= now`); no code path may return a draft
  or future-dated post to an unauthenticated visitor. This layer imports the Feature 7 Drizzle
  schema and returns a typed **read view-model**, never raw rows to the view.
- **FR-016**: The feature MUST NOT write, edit, publish, or delete `posts` (nor any other table);
  it is **read-only** over persistence. Authoring/auto-publishing is Feature 12 + the code-push /
  balance-edit triggers (non-goal).

**Discoverability (US5)**

- **FR-017**: Each public page MUST emit SEO metadata — a descriptive `<title>` and meta
  description, and **OpenGraph** tags — via the framework metadata API (`metadata` export /
  `generateMetadata`), with `metadataBase` set so relative OG image URLs resolve to absolute.
- **FR-018**: The system MUST serve a **sitemap** enumerating `/`, `/news`, and each **published**
  article (with `lastModified`), a **robots** policy that permits indexing public routes and
  references the sitemap, and an **RSS/Atom feed** of published posts (newest first).
- **FR-019**: A **newly published** post MUST become publicly visible (index, article, sitemap,
  feed) **without a full redeploy**, via time-based revalidation and/or an **on-demand
  revalidation** hook that Feature 12 invokes on publish (the F11↔F12 revalidation seam — see
  plan/research). F11 **defines** the cache-tag/path names; F12 **calls** them.

### Key Entities *(include if feature involves data)*

- **Post** *(reused — Feature 7, not redefined here)*: the unified news row
  ([`007-accounts-persistence/data-model.md` → `posts`](../007-accounts-persistence/data-model.md)):
  `slug` (unique), `title`, `excerpt?`, `body` (markdown), `type`
  (`editorial|balance|devlog|changelog`), `status` (`draft|published`), `authorId?` (null for
  auto-posts), `metadata?` (jsonb), `publishedAt?`. This feature **reads** it; it is the single
  source of truth (**P8**).
- **PostSummary (read view-model)**: the projection the News index + Home teaser consume — `slug`,
  `title`, `excerpt`, `type`, derived display **badge** + **tone**, `publishedAt`, optional image.
  Derived from `Post`; never a raw row in the view. *(Defined in this feature's data-model.)*
- **PostView (read view-model)**: the projection the article consumes — `PostSummary` fields plus
  the rendered/rendered-safely body, meta line fields (byline, read-time estimate), and
  `metadata`. *(Defined in this feature's data-model.)*
- **MarketingNav model**: the ordered marketing nav destinations (Overview · News · Roadmap ·
  Community) + Wishlist CTA, each resolving to a section anchor or a route, with active-state
  derivation. Distinct from Feature 3's authenticated app-nav model. *(Defined in this feature's
  data-model.)*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Only published posts are public** — across the index, the Home teaser, every
  article route, the sitemap, and the feed, 0 `draft` (or future-dated) posts are ever returned to
  an unauthenticated request (100% of a seeded draft/published mix filtered correctly); a draft's
  slug returns 404.
- **SC-002**: **News index ordering** — for any seeded set of published posts, `/news` lists them
  strictly by `publishedAt` descending (100% correct order), and every post kind
  (editorial/balance/devlog/changelog) appears.
- **SC-003**: **Article renders markdown safely** — for a corpus of markdown bodies including
  embedded `<script>`, `onerror=`, and `javascript:` payloads, the rendered article contains the
  expected semantic HTML and **zero** executable-injection survivors (0 XSS).
- **SC-004**: **Unknown/draft slug → 404** — 100% of unknown-slug and draft-slug requests return
  HTTP 404 (not 200, not 500).
- **SC-005**: **Both orientations** — Home, News index, and article render with **no horizontal
  overflow** and all content legible/usable at **360px portrait** and **1440px landscape** (P7),
  verified by an automated viewport check.
- **SC-006**: **SEO/OG metadata present** — Home, News index, and every article emit a non-empty
  `<title>`, meta description, and OpenGraph tags (title/description/image/url) — 100% of public
  pages; `/sitemap.xml`, `/robots.txt`, and the feed endpoint each return valid, well-formed
  documents.
- **SC-007**: **Freshness without redeploy** — after a post is published (Feature 12's
  revalidation hook fires, or within the configured revalidation window), the post appears in the
  index, its article, the sitemap, and the feed on the next request, with **no rebuild/redeploy**.
- **SC-008**: **Brand promise present** — the exact string "Skill lives in the plan — never the
  wallet." appears on the Home page, and a non-P2W pillar is present (P1 as marketing copy).

## Assumptions

- **Rendering strategy (judgment call)**: marketing pages are **static-first** (prerendered) with
  **on-demand revalidation** as the primary freshness mechanism and a **time-based revalidation
  window** as a backstop, per [research.md](./research.md). `generateStaticParams` prebuilds known
  article slugs; `dynamicParams` lets not-yet-built slugs render on first request. This satisfies
  "a newly published post appears without a full redeploy" (SC-007) without coupling reads to
  request time.
- **Revalidation seam ownership (judgment call)**: this feature **defines** the cache tags
  (`posts`, `post:{slug}`) / paths (`/news`, `/news/[slug]`) and a small revalidation entry point;
  **Feature 12** (and the code-push / balance-edit auto-post triggers) **calls** it on publish. If
  Feature 12 ships before this hook, the time-based window still delivers freshness. Documented as
  the F11↔F12 contract (research + data-model).
- **Markdown library (judgment call)**: `posts.body` is rendered with **`react-markdown` +
  `remark-gfm`**, raw HTML **disabled** (its default — raw HTML is stripped), so the XSS surface is
  minimal; if raw HTML is ever needed, `rehype-raw` + `rehype-sanitize` (allowlist) are added.
  Rejected: MDX (executes arbitrary JSX over DB/user content) and hand-rolled
  `dangerouslySetInnerHTML`. See [research.md](./research.md).
- **Authoring is out of scope**: despite Feature 7's loose wording ("editorial … Feature 11"),
  **all** writes to `posts` — including editorial — are owned by **Feature 12**'s admin surface.
  Feature 11 is read/present only (FR-016). This is the authoritative reconciliation.
- **Category taxonomy**: the persistence `type` enum (editorial/balance/devlog/changelog) is the
  filter/badge source of truth; the mockups' finer editorial categories (DESIGN/TECH/COMMUNITY)
  are read from `metadata.category` when present, else "NEWS". A featured post = most-recent
  published unless `metadata.featured` overrides.
- **Full-text search is a non-goal for v1**: the mockup's search box is deferred; v1 ships
  category/type filtering + pagination. Naming it as future work, not folding it in (Principle IV).
- **Feature 3 is available**: the design tokens, brand marks (`Logo`, `Wordmark`), and primitives
  (`Button`, `Panel`, `SectionLabel`, `Chip`, `GridBackdrop`) exist and are imported, not
  redefined. The marketing shell composes them (Feature 3 scoped the nav content here).
- **Feature 7 is available**: the `posts` table + Drizzle schema exist; this feature reads them.
  Until Feature 7 lands, the read layer can be exercised against a seeded/fixture posts source.
- **Images**: post images and OG images come from `metadata` (e.g. `metadata.image`,
  `metadata.ogImage`) or a default key-art asset; a per-article dynamic OG image generator is a
  named nice-to-have, not required for v1.
- **Auth**: the marketing site is entirely public/unauthenticated; it neither requires nor
  performs sign-in (the authenticated app shell is Feature 3 / the `(app)` group).
