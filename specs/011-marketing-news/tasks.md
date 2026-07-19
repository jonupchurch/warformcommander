---
description: "Task list for Feature 11 — Marketing Site (Home + News Index + Article Template)"
---

# Tasks: Marketing Site — Home + News Index + Article Template

**Input**: Design documents from `specs/011-marketing-news/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/post-view.md](./contracts/post-view.md), [contracts/routes.md](./contracts/routes.md)

**Tests**: **INCLUDED and non-optional.** The feature's core guarantees are executable — **drafts
are never public** (SC-001), the News index is **ordered by `publishedAt` descending** (SC-002),
markdown renders with **zero XSS survivors** (SC-003), an unknown/draft slug is **always 404**
(SC-004), every page is **both-orientation** (SC-005, P7) and emits **SEO/OG metadata** (SC-006),
and a publish surfaces **without redeploy** (SC-007). Constitution **Principle VIII** + **P1/P7**
require them. Read-layer/markdown/view-model tests are written **before** the code they pin
(Vitest, per sibling features); responsive/read-boundary/404/metadata checks are Playwright.

**Depends on**: **Feature 3** (design tokens, `Logo`/`Wordmark` brand marks, primitives —
`Button`/`Panel`/`SectionLabel`/`Chip`/`GridBackdrop` — and the placeholder `app/page.tsx` this
feature replaces) and **Feature 7** (the `posts` table, Drizzle schema, `posts_published_idx`/
`posts_type_idx`). Both should be built first; where Feature 7 hasn't landed yet, the read layer
can be exercised against a seeded/fixture posts source (spec Assumptions). **Feature 12** (admin +
auto-post triggers) is a *downstream consumer* of this feature's revalidation seam
([contracts/routes.md](./contracts/routes.md) §3) — not a prerequisite.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 (maps to spec.md); Setup/Foundational/Polish carry no story label
- Paths are exact and match [plan.md](./plan.md) Project Structure. Routes under
  `app/(marketing)/`; SEO surfaces at the `app/` root; read/view-model/markdown/revalidate logic
  under `src/lib/`; components under `src/components/marketing/`; e2e in `e2e/marketing.spec.ts`.
  **Read-only over `posts`** — no task here writes/authors/publishes a post (Feature 12 owns that).

> **Note on plan.md's Project Structure**: the OPTIONAL revalidation-trigger route is listed there
> as `src/app/api/revalidate/route.ts`, which conflicts with every other route in the same
> structure (all under root-level `app/`, matching the repo's existing `app/page.tsx`/
> `app/layout.tsx`) — Next.js supports only one `app/` root, and this repo's is at the repo root,
> not `src/app/`. Tasks below use the consistent path **`app/api/revalidate/route.ts`**. Flagged
> here per the "note, don't silently rewrite" rule rather than editing plan.md directly.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm prerequisites and stand up the marketing folders + fixtures + new dependency.

- [ ] T001 Confirm prerequisites are in place: Feature 3's tokens, brand marks (`Logo`, `Wordmark`), and primitives (`Button`, `Panel`, `SectionLabel`, `Chip`, `GridBackdrop`); the placeholder `app/page.tsx` ("real Home = Feature 11") this feature replaces; and Feature 7's `posts` table + Drizzle schema + `posts_published_idx`/`posts_type_idx`. If Feature 7 hasn't landed, note the seeded/fixture-posts fallback (spec Assumptions) for the orchestrator rather than rebuilding Feature 7 here.
- [ ] T002 [P] Create the feature folders: `app/(marketing)/`, `app/(marketing)/news/[slug]/`, `src/lib/`, `src/components/marketing/`, `e2e/` (per [plan.md](./plan.md) Project Structure).
- [ ] T003 [P] Add `react-markdown` + `remark-gfm` to `package.json` (research C1); confirm the repo's Vitest unit runner and Playwright + viewport-matrix helper (Feature 3's responsive test setup, reused by Feature 9) are available for this feature's tests.
- [ ] T004 [P] Add a `posts`-scoped fixture seeder (e.g. `tests/fixtures/posts.ts`, reusing Feature 7's `tests/db-setup.ts` dev-branch/transaction harness where available) inserting known rows: a `published`/`draft` mix across every `type` (`editorial`/`balance`/`devlog`/`changelog`), a future-dated `publishedAt`, and a null-`authorId` auto-post — for the read-layer/view-model tests below.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The read-only query surface, the pure view-model, the safe markdown pipeline, the
revalidation seam, and `metadataBase` — the trust boundary and shared substrate **every** story
renders through. Nothing in Phase 3+ can begin until this is done.

**⚠️ CRITICAL**: This is the published-only trust boundary ([contracts/post-view.md](./contracts/post-view.md))
and the safe-render contract every story depends on.

- [ ] T005 Implement `src/lib/posts.ts` (`import "server-only"`): `getPublishedPosts`, `getPublishedPostBySlug`, `getLatestPosts`, `getPublishedSlugs` — **every** query constrained to `status='published' AND publishedAt<=now()`, ordered by `publishedAt DESC` ([contracts/post-view.md](./contracts/post-view.md) §1); imports Feature 7's Drizzle `posts` schema and its indexes. This is the **only** path any marketing code reads `posts` through.
- [ ] T006 [P] Implement `src/lib/post-view.ts`: `toPostSummary`, `toPostView`, `toBadge` (the `type`/`metadata.category` → badge/tone mapping table, [data-model.md](./data-model.md)), `deriveExcerpt`, `deriveByline`, `estimateReadTime`, `markFeatured` — pure functions, no data access ([contracts/post-view.md](./contracts/post-view.md) §2).
- [ ] T007 [P] Implement `src/lib/markdown.tsx`: `renderPostMarkdown(body)` via `react-markdown` + `remark-gfm`, raw HTML **disabled** — builds React elements, never `dangerouslySetInnerHTML` ([contracts/post-view.md](./contracts/post-view.md) §3, FR-012).
- [ ] T008 [P] Implement `src/lib/revalidate.ts`: the `posts` / `post:{slug}` cache tags and `revalidatePostsPublish(slug)` — the F11↔F12 revalidation seam this feature **defines** ([contracts/routes.md](./contracts/routes.md) §3, FR-019).
- [ ] T009 Edit `app/layout.tsx` (light): set `metadataBase` to the production origin so every route's relative OpenGraph image URLs resolve to absolute (research D1, SC-006) — the one shared prerequisite every route's metadata contract depends on.

**Checkpoint**: the published-only read layer, view-model, safe markdown renderer, revalidation
seam, and `metadataBase` exist; user-story rendering can begin.

---

## Phase 3: User Story 1 — The Home page sells the game and its non-P2W promise (Priority: P1) 🎯 MVP

**Goal**: `/` communicates the one-line pitch, the four pillars (incl. an explicit non-P2W pillar),
the exact brand promise, the roadmap snapshot, and working CTAs — a complete, demonstrable
marketing site even with zero posts.

**Independent Test**: load `/` with an empty `posts` table; assert the hero pitch, pillars, brand
promise, roadmap snapshot, and CTAs render; assert no horizontal overflow at 360px portrait / 1440px
landscape; assert `<title>`/description/OpenGraph metadata is emitted.

### Tests for User Story 1 ⚠️ (write first)

- [ ] T010 [P] [US1] `src/lib/posts.test.ts`: `getLatestPosts` returns `[]` against an empty `posts` table, and returns published-only rows newest-first against the seeded fixture mix (T004) — no draft ever included (spec Independent Test).
- [ ] T011 [P] [US1] `src/lib/post-view.test.ts`: `toPostSummary` maps the latest-posts read correctly; `deriveExcerpt` falls back to first-prose derivation when `excerpt` is `null` (spec edge case).
- [ ] T012 [P] [US1] `e2e/marketing.spec.ts`: `/` against an **empty** `posts` table renders the hero pitch, the exact string **"Skill lives in the plan — never the wallet."**, the four pillars (incl. an explicit non-P2W pillar), the roadmap snapshot v1/backlog split, and all CTAs; **no horizontal overflow** at 360×640 and 1440×900 (SC-005, SC-008, AS1–3).
- [ ] T013 [P] [US1] `e2e/marketing.spec.ts`: `/` emits a non-empty `<title>`, meta description, and OpenGraph tags (SC-006, AS4).

### Implementation for User Story 1

- [ ] T014 [US1] Implement `src/components/marketing/hero.tsx`: the one-line pitch + the exact brand promise + a primary CTA (`Button` primitive) (FR-001).
- [ ] T015 [P] [US1] Implement `src/components/marketing/pillars.tsx`: the four design pillars, one explicitly non-P2W (constitution **P1**) (FR-001).
- [ ] T016 [P] [US1] Implement `src/components/marketing/roadmap-snapshot.tsx`: the "In v1 / Later" split (§16.1) (FR-003).
- [ ] T017 [P] [US1] Implement `src/components/marketing/news-teaser.tsx`: renders the latest published posts (via the page's `getLatestPosts` read) or a placeholder/hidden state when there are none (FR-003, edge case).
- [ ] T018 [P] [US1] Implement `src/components/marketing/community-cta.tsx`: Wishlist / How to Play / Join-the-community as accessible, keyboard-operable `Button` primitives (FR-002).
- [ ] T019 [US1] Implement `app/(marketing)/page.tsx` (Server Component): compose `Hero` + `Pillars` + `RoadmapSnapshot` + `NewsTeaser` + `CommunityCta`; server-read `getLatestPosts`; static `metadata` export (title/description/openGraph) (FR-001–003, FR-017). **Remove** the Feature 3 placeholder `app/page.tsx` (route groups don't change the URL — the two cannot coexist; research X1).

**Checkpoint**: Home renders the pitch, the non-P2W promise, the roadmap snapshot, and working CTAs
against zero posts, in both orientations — the MVP marketing site.

---

## Phase 4: User Story 2 — The marketing shell frames every page in both orientations (Priority: P1)

**Goal**: every marketing page shares a header (brand + nav + Wishlist CTA) and footer, first-class
in both portrait and landscape, with the News destination indicated active on the News routes.

**Independent Test**: render the shell on `/`, `/news`, and an article route; assert nav
destinations + Wishlist CTA are present and link correctly; assert both orientations render
usably; assert the active destination is indicated on `/news`.

### Tests for User Story 2 ⚠️ (write first)

- [ ] T020 [P] [US2] `e2e/marketing.spec.ts`: the header (`Logo` + `Wordmark` + nav + Wishlist CTA) and footer (brand blurb + link columns) render on `/`, `/news`, and an article route; the "News" destination shows `aria-current`/active on `/news`; no horizontal overflow at 360×640 and 1440×900 (SC-005, AS1–3).
- [ ] T021 [P] [US2] `e2e/marketing.spec.ts`: clicking Overview/Roadmap/Community from Home scrolls to the corresponding section; from `/news`, the same items route to Home's corresponding section (AS4).

### Implementation for User Story 2

- [ ] T022 [US2] Implement `src/components/marketing/marketing-nav.tsx` (`"use client"` leaf): the `MarketingNav` model ([data-model.md](./data-model.md)) — Overview·News·Roadmap·Community + Wishlist CTA; active state via `usePathname`; composes Feature 3's `Logo`/`Wordmark`/`Button` (FR-005).
- [ ] T023 [P] [US2] Implement `src/components/marketing/marketing-footer.tsx`: brand blurb + Game/Community/More link columns + copyright (FR-004).
- [ ] T024 [US2] Implement `app/(marketing)/layout.tsx`: the `MarketingShell` (Server Component) — header (`MarketingNav`) + footer (`MarketingFooter`) wrapping `children`, token-only styling, no raw brand hex (FR-004, FR-006, Feature 3 SC-002). Now wraps Home (US1) and every subsequent route in this feature.

**Checkpoint**: every marketing page shares the header/nav/footer, first-class in both
orientations, with correct active-state and section navigation.

---

## Phase 5: User Story 3 — The News index lists published posts, newest first (Priority: P2)

**Goal**: `/news` lists every **published** post kind (editorial/balance/devlog/changelog) newest
first, with a featured lead + grid, a type badge, pagination, and a graceful empty state — drafts
never appear.

**Independent Test**: seed `posts` with a `published`/`draft` mix across every `type`; load `/news`;
assert only published posts appear, ordered by `publishedAt` descending; assert each auto-posted
kind renders with its badge; assert the empty state renders with zero published posts.

### Tests for User Story 3 ⚠️ (write first)

- [ ] T025 [P] [US3] `src/lib/posts.test.ts`: `getPublishedPosts` against the seeded published/draft/every-type mix (T004) returns **only** `status='published'` rows, ordered by `publishedAt` **descending**; zero drafts, zero future-dated rows (SC-001, SC-002, spec Independent Test).
- [ ] T026 [P] [US3] `src/lib/post-view.test.ts`: `toBadge` maps every `type` + `metadata.category` combination per the [data-model.md](./data-model.md) table, including an unrecognized `type`/category falling back to `NEWS`/`neutral` (AS2, edge case).
- [ ] T027 [P] [US3] `src/lib/post-view.test.ts`: `markFeatured` sets exactly one `featured=true` per page — a `metadata.featured` override wins over recency; with no override, the most-recently-published post is featured (data-model rule).
- [ ] T028 [P] [US3] `e2e/marketing.spec.ts`: `/news` renders a featured lead + grid, each item with a type badge, date, title, and excerpt, linking to its article; a seeded `draft` post is **absent** from the rendered page (AS1–2).
- [ ] T029 [P] [US3] `e2e/marketing.spec.ts`: `/news` renders a graceful empty state ("No dispatches yet") with zero published posts; with more published posts than one page holds, the feed **paginates** (newest page first) (AS3–4).
- [ ] T030 [P] [US3] `e2e/marketing.spec.ts`: the featured post + grid reflow to a single column at 360×640 and a multi-column grid at 1440×900, no horizontal overflow (SC-005, AS5).

### Implementation for User Story 3

- [ ] T031 [US3] Implement `src/components/marketing/post-badge.tsx`: renders a `PostBadge` via Feature 3's `Chip` (tone from the data-model mapping table).
- [ ] T032 [US3] Implement `src/components/marketing/featured-post.tsx`: the featured lead item (FR-008).
- [ ] T033 [P] [US3] Implement `src/components/marketing/post-card.tsx`: a grid card — badge, date, title, excerpt, linking to its article (FR-008).
- [ ] T034 [P] [US3] Implement `src/components/marketing/news-pagination.tsx`: page controls over `getPublishedPosts`'s `total` (FR-009).
- [ ] T035 [P] [US3] Implement `src/components/marketing/category-filter.tsx` (`"use client"` leaf): category chips mapping display categories to `posts.type` + `metadata.category` (FR-010).
- [ ] T036 [US3] Implement `app/(marketing)/news/page.tsx` (Server Component): `await searchParams` (`page`, `type`) → validate/clamp (Principle II, mirroring [Ladder's pattern](../009-ladder/data-model.md)) → `getPublishedPosts` → `toPostSummary` + `markFeatured` → render `FeaturedPost` + grid of `PostCard` + `NewsPagination` + `CategoryFilter`; empty state when zero results; static `metadata` export; tagged `posts`. Add `app/(marketing)/news/loading.tsx` skeleton.

**Checkpoint**: `/news` lists every published post kind, ordered correctly, paginated, filterable,
empty-state safe, and both-orientation — the hub of the unified posts system.

---

## Phase 6: User Story 4 — An article renders a post from markdown by slug (Priority: P2)

**Goal**: `/news/<slug>` renders a published post's title, meta line, and markdown body **safely**;
an unknown or unpublished slug always 404s; every post kind renders through the same template.

**Independent Test**: seed a published post with a markdown body exercising headings, lists,
blockquotes, links, and an image; request `/news/<slug>`; assert expected structure and **zero**
XSS survivors; request an unknown slug and a `draft` slug and assert both 404.

### Tests for User Story 4 ⚠️ (write first)

- [ ] T037 [P] [US4] `src/lib/posts.test.ts`: `getPublishedPostBySlug` returns `null` for an unknown slug **and** for a `draft`/future-dated slug — the two are indistinguishable to the caller (SC-004, AS2).
- [ ] T038 [P] [US4] `src/lib/markdown.test.ts`: a markdown corpus containing `<script>`, `onerror=`, and `javascript:` payloads renders semantic HTML (headings/paragraphs/lists/blockquotes/links/images) with **zero** executable-injection survivors (SC-003, AS1/3).
- [ ] T039 [P] [US4] `src/lib/post-view.test.ts`: `toPostView` / `deriveByline` / `estimateReadTime` — a `null` `authorId` yields a studio/system byline; the read-time estimate is `≥1` for a short body; `metadata` passes through unmodified (FR-014).
- [ ] T040 [P] [US4] `e2e/marketing.spec.ts`: `/news/<slug>` for a published post with a rich markdown body renders title, meta line, and the expected semantic HTML structure; an unknown slug **and** a `draft` slug each return **HTTP 404** via the marketing not-found page (SC-004, AS1–2).
- [ ] T041 [P] [US4] `e2e/marketing.spec.ts`: an auto-posted `changelog`/`devlog` article (structured `metadata`, no lead image) renders cleanly with its badge and surfaced metadata (e.g. commit SHA, balance delta); a very long article renders without layout breakage (AS4, edge case).
- [ ] T042 [P] [US4] `e2e/marketing.spec.ts`: an article emits `generateMetadata` `title`/description/OpenGraph (incl. image) (SC-006, AS5).

### Implementation for User Story 4

- [ ] T043 [US4] Implement `src/components/marketing/article-header.tsx`: eyebrow/type badge + title + meta line (byline · date · read time) (FR-011).
- [ ] T044 [P] [US4] Implement `src/components/marketing/article-body.tsx`: renders `PostView.bodyHtml` and surfaces `metadata` (balance delta, commit SHA) when present, degrading gracefully with no image/excerpt (FR-014).
- [ ] T045 [US4] Implement `app/(marketing)/news/[slug]/page.tsx`: `generateStaticParams` via `getPublishedSlugs`; `dynamicParams = true`; `await params`; `getPublishedPostBySlug` → `toPostView`; `notFound()` on `null`; `generateMetadata` (title/description/openGraph/canonical); tagged `post:{slug}` + `posts` ([contracts/routes.md](./contracts/routes.md), FR-011–013, FR-017).
- [ ] T046 [US4] Implement `app/(marketing)/not-found.tsx`: the marketing 404 page, rendered for both an unknown route and an unknown/draft/future slug (FR-013).
- [ ] T047 [P] [US4] OPTIONAL: implement `app/(marketing)/news/[slug]/opengraph-image.tsx` — a per-article dynamic OG image generator (named nice-to-have, spec Assumptions); if skipped, the default metadata image is used.

**Checkpoint**: every published post kind is a real, safely-rendered, correctly-404ing, SEO-tagged
destination — the second half of Home → News → article.

---

## Phase 7: User Story 5 — The site is discoverable and shareable (SEO / OG / sitemap / RSS) (Priority: P3)

**Goal**: `/sitemap.xml`, `/robots.txt`, and an RSS/Atom feed each work correctly against
published-only posts, and a newly published post surfaces across index/article/sitemap/feed
without a redeploy.

**Independent Test**: request the sitemap/robots/feed endpoints; assert correct content and
draft-exclusion. Publish a new post (simulate Feature 12's revalidation call) and assert it appears
in `/news`, its article, the sitemap, and the feed without rebuilding.

### Tests for User Story 5 ⚠️ (write first)

- [ ] T048 [P] [US5] `e2e/marketing.spec.ts`: `/sitemap.xml` lists `/`, `/news`, and one entry per **published** article with `lastModified`; a seeded `draft` post is excluded (SC-001, SC-006, AS1).
- [ ] T049 [P] [US5] `e2e/marketing.spec.ts`: `/robots.txt` permits indexing of public routes and references the sitemap URL (AS2).
- [ ] T050 [P] [US5] `e2e/marketing.spec.ts`: the feed endpoint returns a valid feed of **published** posts, newest first, each with title/link/publish-date/summary (AS3).
- [ ] T051 [P] [US5] Integration check (Playwright against a `next build && next start` instance, or an equivalent revalidation harness): calling `revalidatePostsPublish(slug)` directly (simulating Feature 12's publish trigger) makes the new post appear in `/news`, its article, `/sitemap.xml`, and the feed on the **next request**, with **no rebuild** (SC-007, AS4). Note in the task's output if dev-mode ISR semantics require the built/started server to observe this accurately (research A1/A3).

### Implementation for User Story 5

- [ ] T052 [US5] Implement `app/sitemap.ts`: entries for `/`, `/news`, and each `getPublishedPosts()` result with `lastModified = updatedAt`; tagged `posts` (FR-018).
- [ ] T053 [P] [US5] Implement `app/robots.ts`: allow indexing of public marketing routes, reference the sitemap URL (FR-018).
- [ ] T054 [P] [US5] Implement `app/feed.xml/route.ts`: RSS/Atom of `getPublishedPosts({ limit: <feedCap> })`, newest first, mapped to title/link/pubDate/summary; advertise via `alternates.types['application/rss+xml']` in the root/marketing metadata (FR-018, research D3).
- [ ] T055 [P] [US5] OPTIONAL: implement `app/api/revalidate/route.ts` (or export a shared Server Action) wrapping `revalidatePostsPublish` for Feature 12 to call cross-module (FR-019, [contracts/routes.md](./contracts/routes.md) §3). *(Path corrected from plan.md's `src/app/api/revalidate/route.ts` — see the note above.)*

**Checkpoint**: the site is crawlable, unfurlable, and subscribable, and a publish reaches every
public surface without a redeploy.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T056 [P] Run the full SC-001…SC-008 suite green (Vitest unit + Playwright e2e) against Feature 7's dev-branch/fixture posts; confirm `next build`, `tsc --noEmit`, and ESLint (incl. the no-raw-hex guard) pass.
- [ ] T057 [P] Verify **P7** across every marketing surface (hero, pillars, roadmap, news grid, article, header, footer) at 360×640 and 1440×900 in one consolidated Playwright pass; wire into the CI viewport matrix alongside Feature 3/9's.
- [ ] T058 [P] Audit token-only styling in every new `src/components/marketing/*` file — no raw brand hex (Feature 3 SC-002) — and confirm the ESLint no-raw-hex guard covers the new directory.
- [ ] T059 Update repo docs: `CHANGELOG.md` (Marketing site — Home, News index, article template, SEO surfaces) and flip Feature 11 → built in `STATUS.md`; queue a devlog news note per the repo's "code push → news" convention — the first real exercise of Feature 11 rendering a devlog post about itself.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → depends on Feature 3 + Feature 7 being built (or their fixture fallback).
- **Foundational (P2)** → depends on Setup; **blocks all user stories** (the read layer, view-model, markdown renderer, revalidation seam, `metadataBase`).
- **US1 (P3)** → depends on Foundational; the MVP (Home, renders standalone without the shell).
- **US2 (P4)** → depends on Foundational; wraps US1's Home in the shared shell — independently testable, but naturally follows US1 (both P1, co-delivered per spec).
- **US3 (P5)** → depends on Foundational + US2 (renders inside the shell; the News destination's active state is US2's).
- **US4 (P6)** → depends on Foundational + US2 (renders inside the shell); largely parallel to US3 (different files — the read layer and markdown renderer are already built in Foundational).
- **US5 (P7)** → depends on Foundational + US3 + US4 (the sitemap/feed enumerate the News index + articles those stories render).
- **Polish (P8)** → depends on all desired stories.

### Within a story

Tests (read-boundary/ordering/sanitization/mapping first) → components → route wiring. Commit
after each task or logical group (Principle IX).

### Parallel opportunities

- Setup: T002/T003/T004 in parallel.
- Foundational: T006/T007/T008 in parallel (distinct files) after T005; T009 is independent and can run anytime in this phase.
- US1 tests T010–T013 all `[P]`; then components T015–T018 parallel, T014/T019 sequential (page composes them).
- US2 tests T020/T021 `[P]`; then T023 parallel to T022, T024 sequential (composes both).
- US3 tests T025–T030 all `[P]`; then T033–T035 parallel, T031/T032/T036 sequential (badge/featured feed into the page).
- US4 tests T037–T042 all `[P]`; then T044 parallel to T043, T045–T047 sequential/optional.
- **US3 and US4** can be worked in parallel once US2's shell exists — different files (news index vs. article), both consuming the same Foundational read layer.
- US5 tests T048–T051 all `[P]`; then T053/T054/T055 parallel to T052.

---

## Implementation Strategy

### MVP first (US1)

Setup → Foundational → **US1** → **STOP & VALIDATE**: Home renders the pitch, the exact non-P2W
brand promise, the pillars, the roadmap snapshot, and working CTAs against zero posts, with no
horizontal overflow at 360px/1440px and correct metadata (SC-005, SC-006, SC-008). That alone is a
complete, demonstrable marketing front door.

### Incremental delivery

US1 (Home) → US2 (shell/nav wraps every page) → US3 (News index) → US4 (article template) → US5
(sitemap/robots/RSS + the freshness contract). Each adds value without breaking prior stories; the
feature is "done" when SC-001…SC-008 are green and `next build`/typecheck/lint pass.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- **Read-only is the spine**: no task here writes/authors/publishes `posts` — Feature 12 + the
  code-push/balance-edit auto-post triggers own the write path (FR-016); this feature only defines
  the revalidation seam Feature 12 calls.
- **The published-only filter lives in the query, not the UI** (`src/lib/posts.ts`, T005) — every
  story's "drafts never appear" guarantee traces back to this single choke point (SC-001,
  Principle II). Never add a second, UI-side draft filter as a substitute.
- **A draft slug and an unknown slug are indistinguishable** (T037, T045–T046) — both resolve to
  `null` from the read layer and both 404 through the same `notFound()` call; no code path may
  special-case "this exists but is a draft."
- **P7 is verified at 360 *and* 1440 in every story that renders a page** (US1, US2, US3), and
  again consolidated in Polish (T057) — never checked at only one width.
- **Markdown safety is one pipeline, not per-caller sanitization** (`src/lib/markdown.tsx`, T007) —
  the article body, the derived excerpt, and the feed summary all render through it (SC-003).
