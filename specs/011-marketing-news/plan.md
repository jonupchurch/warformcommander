# Implementation Plan: Marketing Site — Home + News Index + Article Template

**Branch**: `011-marketing-news` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-marketing-news/spec.md`

## Summary

Build the **public marketing site** — Home/landing (`/`), News index (`/news`), and the
article/Content-Page template (`/news/[slug]`), plus the **marketing shell/nav** (Overview · News
· Roadmap · Community + Wishlist) — as a **read-only, SEO-friendly, both-orientation** surface of
Warform Commander. It **reads** the unified `posts` table (Feature 7) via
`posts WHERE status='published' ORDER BY publishedAt DESC` and renders it; it does **not** author
posts (Feature 12 + the code-push/balance-edit auto-post triggers own writing). It composes
Feature 3's tokens, brand marks, and primitives (Feature 3 deliberately scoped the marketing-shell
nav content here). The headline product concerns are **P1** (the non-P2W promise *is* the
marketing copy) and **P7** (both portrait and landscape first-class).

The technical approach, resolved in [research.md](./research.md): **static-first rendering** on
**Next.js 16** — `generateStaticParams` prebuilds known article slugs, `dynamicParams` renders
new slugs on first request, and freshness comes from **on-demand revalidation** (the seam Feature
12 calls on publish) backed by a **time-based revalidation window** — so a newly published post
(editorial *or* auto-posted devlog/balance) appears **without a redeploy** (SC-007). `posts.body`
markdown is rendered through a **safe RSC pipeline** (`react-markdown` + `remark-gfm`, raw HTML
disabled). SEO is the framework metadata API (`generateMetadata`/`metadata`, `metadataBase`) plus
`app/sitemap.ts`, `app/robots.ts`, and an RSS feed route. Verification is Playwright across a
360×640 portrait / 1440×900 landscape matrix plus a draft-never-public read test, index-ordering
test, markdown-sanitization test, article-by-slug + 404 test, and a metadata/sitemap/feed presence
check.

## Technical Context

**Language/Version**: **TypeScript** on **Next.js 16** (App Router, Turbopack, React 19) — the
existing repo-root app. No new language surface (contrast Feature 1's Rust); this is a
presentation + read-data feature.

**Primary Dependencies**: `next` 16 (present), `react` 19 (present); **Feature 3** design system
(`src/components/ui/*`, `src/components/brand/*`, `app/globals.css` tokens); **Feature 7**
persistence (`db/schema.ts` `posts` + the Drizzle/`postgres-js` client). New runtime deps:
**`react-markdown`** + **`remark-gfm`** (safe markdown → React elements in RSC; `rehype-raw` +
`rehype-sanitize` only if raw HTML is ever enabled). Dev/test: `@playwright/test` (present per
STATUS.md) for the responsive + read-boundary e2e; a lightweight unit runner for the read-layer /
view-model / markdown-sanitization tests.

**Storage**: **Read-only** over Feature 7's Neon Postgres via Drizzle (`postgres-js` driver,
`getDb()`), constrained to `posts WHERE status='published' ORDER BY publishedAt DESC`
([`007-accounts-persistence/data-model.md` → `posts`](../007-accounts-persistence/data-model.md)).
This feature persists nothing and writes nothing (FR-016).

**Testing**: **Playwright** e2e (responsive viewport matrix 360×640 / 1440×900; no-horizontal-
overflow; draft-never-public; index ordering; article-by-slug + 404; metadata/sitemap/feed
presence) + unit tests for the posts read layer (published-only filter), the `type`→badge/tone
mapping, and the markdown sanitizer (XSS corpus). Matches constitution **Principle VIII** and
[`stacks/nextjs.md`](../../stacks/nextjs.md) ("`next build` passes; changed route renders; static-
vs-dynamic is intentional").

**Target Platform**: The **browser**, unauthenticated, both **mobile portrait AND desktop
landscape as co-equal first-class targets** (P7). Deployed on Vercel (existing); pages are
prerendered/ISR at the edge/CDN.

**Project Type**: A set of **public routes inside the existing repo-root Next.js app** — a
`app/(marketing)/` route group (shell layout + Home + News + article) plus root-level
`sitemap.ts`/`robots.ts`/feed route, a `src/lib/posts.ts` read layer, and
`src/components/marketing/*`. Additive; no restructuring.

**Performance Goals**: Static/ISR delivery from CDN (near-zero server render on cache hit);
no font-swap layout shift (inherits Feature 3's `next/font` self-hosting); **no horizontal
overflow at any width 360px→ultra-wide** (SC-005); a newly published post visible on next request
without redeploy (SC-007).

**Constraints**: **P7 is a hard constraint** — both orientations designed *for*, not adapted
(SC-005). **Read-only** over persistence — no write path exists (FR-016). **Draft posts are never
public** — enforced in the read query, not the UI (SC-001, Principle II). **Markdown is
sanitized** — no unsanitized `dangerouslySetInnerHTML` (SC-003). **Token-only styling** — no raw
brand hex (Feature 3 SC-002). Fits the existing repo-root app without restructuring it.

**Scale/Scope**: Three page types + shell + SEO surfaces. **In scope**: Home, News index
(featured + grid + pagination + type filter), article template (safe markdown), marketing shell/
nav/footer, `sitemap.ts`/`robots.ts`/RSS, the read layer + view-models + revalidation seam.
**Out of scope**: authoring/editing/auto-posting posts (Feature 12 + triggers), the authenticated
app shell (Feature 3), Admin (Feature 12), any game screen, full-text search, dynamic per-article
OG-image generation (named future work).

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1 design. Constitution v3.0.0 —
Product Invariants P1–P8 + Engineering Process I–IX.*

### Product & Architecture Invariants

| Invariant | Status | How this plan satisfies it |
|---|---|---|
| **P1 Non-P2W by construction (NON-NEG)** | ✅ **core marketing copy** | The Home page communicates the promise verbatim ("Skill lives in the plan — never the wallet") and a non-P2W pillar (FR-001, SC-008). The site sells/gates nothing and reaches no economy surface, so it cannot *violate* P1; its job is to *state* it. |
| **P2 Planning over twitch** | ✅ (communicated) | The pitch and pillars frame the game as pre-battle planning; no battle input or twitch surface exists in marketing. |
| **P3 Depth from configuration** | ✅ (communicated) | The "depth from configuration" pillar is marketing copy; the site itself composes Feature 3 primitives (depth-from-composition, the UI echo of P3) rather than bespoke one-offs. |
| **P4 Fairness is verified** | ✅ (communicated / N/A) | The "fairness is verified" pillar is copy; no balance surface here. Auto-posted `balance` posts (from Feature 12's balancer/ruleset edits) are *rendered* as devlog content — the public face of P4's verification. |
| **P5 Content from players/puzzles** | ✅ (enabling) | The unified news feed — including **auto-posted** devlog/changelog/balance entries — is the public devlog; rendering those well is how the "code push → news post" project rule reaches players. |
| **P6 Deterministic, server-authoritative (NON-NEG)** | ✅ (N/A here) | The marketing site runs no sim and fabricates no result; it is a read/present layer. It never trusts client state (nothing to authorize) and never writes. No P6 surface. |
| **P7 Both platforms first-class (NON-NEG)** | ✅ **headline deliverable** | Every marketing surface (hero, pillars, roadmap, news grid, article, header, footer) is designed *for* 360px portrait **and** 1440px landscape (FR-006, SC-005), verified by a Playwright viewport matrix — the mockups are desktop; this feature *completes* them for portrait. |
| **P8 Data-driven content** | ✅ | The site reads the **single source of truth** — Feature 7's `posts` (P8) and Feature 3's tokens/primitives — and defines no game/content data of its own; it projects them into read view-models (data-model). |

### Engineering Process (I–IX)

| Principle | Status | Note |
|---|---|---|
| **I Clarify** | ✅ | Spec has prioritized, independently-testable stories, acceptance scenarios, edge cases, and explicit non-goals; the authoring-ownership and rendering-strategy ambiguities are resolved in Assumptions. Zero open `NEEDS CLARIFICATION`. |
| **II Validated trust boundaries** | ✅ | The public read layer constrains **every** query to `status='published'` (+ `publishedAt<=now`) so a draft/future post can never reach an anonymous visitor (FR-013/FR-015, SC-001); markdown is **sanitized** before render (FR-012, SC-003). No authorization is trusted from the client (there is none). |
| **III Match conventions** | ✅ | Composes Feature 3's established design-system conventions (semantic tokens, `cn()`, `src/components/*` split) and Feature 7's read patterns (`getDb()`, typed rows); route-group + `generateMetadata`/`sitemap.ts` are the framework-idiomatic shapes ([`stacks/nextjs.md`](../../stacks/nextjs.md)). New marketing components follow the existing primitive shape. |
| **IV Scope discipline (NON-NEG)** | ✅ | Read + present only. Authoring (F12), the auth app shell (F3), Admin (F12), game screens, full-text search, and dynamic OG-image generation are explicitly **out** and *named*, not folded in. |
| **V Verify before done** | ✅ | SC-001..008 are executable (Playwright + unit); "done" = green across the viewport matrix + the read-boundary/sanitization/404 tests + `next build` + typecheck ([quickstart-style checks in tasks.md](./tasks.md)). |
| **VI Narrate** | ✅ | [research.md](./research.md) records every decision (rendering strategy, revalidation seam, markdown lib, SEO) with rationale + rejected alternatives, cited. |
| **VII Plan whole set first** | ✅ | Part of the foundation-first planning pass; this plan consumes the Feature 3 (design system) and Feature 7 (`posts`) contracts already planned, and defines the F11↔F12 revalidation seam Feature 12 will call. |
| **VIII Test at right level** | ✅ | e2e (Playwright) for the responsive/read-boundary/404/metadata paths a unit test can't reach; unit for the read-layer filter, the `type`→badge map, and the markdown sanitizer (where the real logic/risk lives). |
| **IX Commit atomically, branch per feature** | ✅ | On `011-marketing-news`; artifacts + implementation commit atomically per phase/story. |

**Gate result: PASS.** No deviations require Complexity Tracking (see below). The never-waived
invariants in play — **P1** (satisfied as core marketing copy) and **P7** (the feature's headline,
satisfied by design) — are met, not traded; **P6** has no surface (read-only, no sim, no writes).

## Project Structure

### Documentation (this feature)

```text
specs/011-marketing-news/
├── plan.md              # this file
├── spec.md              # prioritized stories, FRs, success criteria
├── research.md          # Phase 0 — rendering strategy, revalidation seam, markdown, SEO
├── data-model.md        # Phase 1 — marketing nav model + post read view-models (reuse Feature 7 posts)
├── contracts/
│   ├── routes.md        # route map + per-route rendering/metadata/revalidation contract
│   └── post-view.md     # PostSummary/PostView projection + the safe markdown-render contract
└── tasks.md             # Phase 2 — created by /speckit-tasks (next step)
```

### Source Code (repository root)

The existing Next.js app is at the **repo root** (`app/`, `app/globals.css`, `app/layout.tsx`,
`db/`, `src/components/*` from Feature 3). This feature **moves the placeholder Home into a
`(marketing)` route group**, adds the marketing routes, the SEO surfaces, a read layer, and the
marketing components. Additive; no restructuring.

```text
d:/Codelib/warformcommander/
├── app/
│   ├── (marketing)/                        # NEW — public marketing route group (shares the marketing shell)
│   │   ├── layout.tsx                       # NEW — MarketingShell (Server Component): header(nav+CTA) + footer
│   │   ├── page.tsx                         # NEW — Home/landing "/" (hero, pillars, roadmap, latest-news teaser, CTAs)
│   │   │                                    #   (replaces the Feature 3 placeholder app/page.tsx — see note)
│   │   ├── news/
│   │   │   ├── page.tsx                      # NEW — News index "/news" (featured + grid + pagination + type filter)
│   │   │   ├── loading.tsx                   # NEW — skeleton
│   │   │   └── [slug]/
│   │   │       ├── page.tsx                  # NEW — article "/news/[slug]" (generateStaticParams + generateMetadata)
│   │   │       └── opengraph-image.tsx       # OPTIONAL — per-article OG image (else metadata default)
│   │   └── not-found.tsx                     # NEW — marketing 404 (unknown/draft slug)
│   ├── page.tsx                             # REMOVE — the placeholder moves into (marketing)/page.tsx
│   ├── sitemap.ts                           # NEW — "/", "/news", + each published article; excludes drafts
│   ├── robots.ts                            # NEW — allow public routes, reference sitemap
│   ├── feed.xml/route.ts                    # NEW — RSS/Atom feed of published posts (route handler)
│   └── layout.tsx                           # EDIT (light) — ensure metadataBase set for absolute OG URLs
├── src/
│   ├── lib/
│   │   ├── posts.ts                          # NEW — read layer: getPublishedPosts / getPublishedPostBySlug /
│   │   │                                     #   getLatestPosts (published-only; typed view-models); the trust boundary
│   │   ├── post-view.ts                      # NEW — Post → PostSummary/PostView mapping + type→badge/tone map
│   │   ├── markdown.tsx                       # NEW — safe react-markdown renderer (remark-gfm; raw HTML off)
│   │   └── revalidate.ts                      # NEW — the F11↔F12 seam: tag/path names + revalidate entry point
│   └── components/
│       └── marketing/                        # NEW — marketing-only components (compose Feature 3 primitives)
│           ├── marketing-nav.tsx             # NEW ("use client" leaf) — Overview·News·Roadmap·Community + Wishlist; active state
│           ├── marketing-footer.tsx          # NEW — brand blurb + Game/Community/More columns
│           ├── hero.tsx  pillars.tsx  roadmap-snapshot.tsx  community-cta.tsx   # NEW — Home sections
│           ├── post-card.tsx  featured-post.tsx  post-badge.tsx                 # NEW — news feed items
│           ├── news-pagination.tsx  category-filter.tsx                          # NEW — index controls
│           └── article-body.tsx  article-header.tsx                              # NEW — article template pieces
├── app/api/revalidate/route.ts              # OPTIONAL — HTTP entry for Feature 12's publish trigger (or a shared Server Action)
├── e2e/marketing.spec.ts                    # NEW — Playwright: responsive matrix, draft-never-public, 404, metadata
└── (existing: app/globals.css, src/components/{ui,brand,shell}/*, db/schema.ts, package.json, …)
```

**Structure Decision**: A **`app/(marketing)` route group** owns the public site so all marketing
pages inherit one shell layout (mirroring how Feature 3's `app/(app)/layout.tsx` owns the
authenticated shell). The **placeholder `app/page.tsx`** Feature 3 left ("real Home = Feature 11")
is **replaced** by `app/(marketing)/page.tsx` (route groups don't change the URL, so this is still
`/`; the two cannot coexist). The **read layer** lives in `src/lib/posts.ts` as the single trust
boundary (published-only), returning typed **view-models** so views never touch raw rows. SEO
surfaces (`sitemap.ts`, `robots.ts`, `feed.xml`) sit at the app root per framework convention.
Marketing components live under `src/components/marketing/` — a new sibling to Feature 3's
`shell/`/`brand/`/`ui/` split — and **compose** Feature 3 primitives rather than restyling. This
keeps Feature 11 additive to the existing app and cleanly separated from the authenticated shell.

## Complexity Tracking

*No constitution deviations require justification.* Every dependency introduced (`react-markdown`,
`remark-gfm`) is a mainstream, RSC-compatible, first-choice library adopted to *satisfy* the
constitution (safe markdown rendering for SC-003/Principle II), not to exceed scope. No new
language, service, or architectural layer is added; the feature is additive read/present code on
the existing stack.

| Consideration | Decision | Simpler alternative rejected because |
|---|---|---|
| `react-markdown` + `remark-gfm` vs `dangerouslySetInnerHTML` of `marked`/`markdown-it` output | Adopt `react-markdown` | It builds React elements (no `dangerouslySetInnerHTML`) and strips raw HTML by default — the safest RSC pipeline for DB-authored content (research; SC-003). String-HTML + `dangerouslySetInnerHTML` reintroduces the XSS surface Principle II forbids. |
| Static-first + on-demand revalidation vs `force-dynamic` (render every request) | Static-first + ISR/on-demand | `force-dynamic` would hit the DB on every request and forfeit CDN delivery; static-first with a revalidation seam gives both freshness (SC-007) and performance without papering over caching ([`stacks/nextjs.md`](../../stacks/nextjs.md)). |
| Own a small revalidation entry point in F11 vs let F12 revalidate F11's routes directly | Own the tag/path names in F11 | Making F11 the **definer** of `posts` / `post:{slug}` tags keeps the read/cache contract with the reader that owns it; F12 just *calls* the agreed seam — a clean one-way dependency (research). |

## Post-Design Constitution Re-check

After Phase 1 ([data-model.md](./data-model.md), [contracts/](./contracts/)): **still PASS.**
- The **read layer + view-models** keep the published-only filter and markdown sanitization at the
  data boundary → **P6-adjacent trust boundary** (Principle II), SC-001, SC-003 hold; the view
  never sees a raw row or unsanitized body.
- The **routes contract** fixes static-first rendering + the on-demand revalidation seam → SC-007
  (freshness without redeploy) and the clean F11↔F12 dependency.
- The **marketing nav + shell** compose Feature 3 semantics only (no raw hex) and are specified for
  **both orientations** → **P7**, SC-005; **P1** copy is a fixed content requirement (SC-008).
- No new complexity surfaced; the tracked considerations above are unchanged. The never-waived
  invariants in play (**P1**, **P7**) are satisfied structurally, not traded.

## Phase status

- [ ] **Phase 0 — Research** → [research.md](./research.md) (rendering strategy, revalidation
  seam, markdown pipeline, SEO — all unknowns resolved)
- [ ] **Phase 1 — Design & contracts** → [data-model.md](./data-model.md),
  [contracts/](./contracts/)
- [ ] **Phase 2 — Tasks** → `tasks.md` via `/speckit-tasks` (next)

> Phases 0–1 artifacts are authored alongside this plan; the boxes track the Spec-Kit workflow
> gates for this feature.
