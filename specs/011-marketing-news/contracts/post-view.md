# Contract: Posts Read Surface + View-Model + Safe Markdown Render

**Feature**: `011-marketing-news` | **Spec**: [../spec.md](../spec.md) | **Data model**:
[../data-model.md](../data-model.md)

The **read-only** query surface every marketing page/SEO surface calls, the **view-model** it
renders, and the **safe markdown-render** contract that makes rendering a post's body
non-negotiable-safe. This feature adds **no persisted entities** and **no write path** — it reads
[Feature 7's `posts`](../../007-accounts-persistence/data-model.md) and is the **only** path any
marketing code touches that table (data-model §"Assembly & trust boundary"). Signatures are
TypeScript-shaped contracts (illustrative, not the implementation).

---

## 1. Read surface (`src/lib/posts.ts` — `import "server-only"`, read-only)

```ts
type PostSummaryRaw = Pick<Post,
  "id" | "slug" | "title" | "excerpt" | "type" | "status" | "authorId" | "metadata" | "publishedAt">;

type PostRaw = PostSummaryRaw & Pick<Post, "body" | "createdAt" | "updatedAt">;

interface ListPublishedOpts {
  limit?: number;              // page size (clamped, e.g. ≤ 50)
  offset?: number;             // simple offset paging (v1 scale; see research A/note)
  type?: Post["type"];         // FR-010 category/type filter; omitted ⇒ all types
}

// The News index / Home teaser / sitemap / feed read. ALWAYS filters status='published'
// AND publishedAt <= now(), ordered by publishedAt DESC. Never returns a draft or future post.
getPublishedPosts(opts?: ListPublishedOpts): Promise<{
  rows: PostSummaryRaw[];
  total: number;                // count of published posts matching `type` (for pagination, FR-009)
}>

// Article read by slug. Returns null for an unknown slug OR a slug whose post is not
// published-and-not-future — a draft is NEVER distinguishable from "doesn't exist" (FR-013).
getPublishedPostBySlug(slug: string): Promise<PostRaw | null>

// Home teaser convenience read — the N most recent published posts (== getPublishedPosts
// with limit=N, no type filter). Returns [] when there are zero published posts (edge case).
getLatestPosts(limit: number): Promise<PostSummaryRaw[]>

// generateStaticParams() source — every published slug, for build-time prerender (research A2).
getPublishedSlugs(): Promise<string[]>
```

**The trust-boundary invariant (every function above, no exceptions):**

```sql
WHERE status = 'published' AND published_at IS NOT NULL AND published_at <= now()
```

applied **in the query**, never as a post-fetch filter in application code (Principle II, SC-001).
This is the same posture Feature 7 mandates for its own reads
([007 data-model → Trust-boundary rules](../../007-accounts-persistence/data-model.md)).

### Relationship to Feature 7

| Feature 7 | Feature 11 use |
|---|---|
| `posts` table, `posts_published_idx (status, publishedAt)` | The index this read layer's `WHERE`/`ORDER BY` is designed to hit (FR-007). |
| `posts_type_idx (type)` | Backs the `type` filter in `ListPublishedOpts` (FR-010). |

Feature 7 (and Feature 12's writers) remain the **sole writers** of `posts`; this surface never
mutates (FR-016).

---

## 2. View-model mapping (`src/lib/post-view.ts` — pure, no data access)

```ts
// PostSummary / PostView / PostBadge shapes — defined in ../data-model.md.

toPostSummary(row: PostSummaryRaw): PostSummary;
toPostView(row: PostRaw): PostView;                 // adds bodyHtml (via §3), byline, readTimeMinutes, ogImage
toBadge(type: Post["type"], metadata: Post["metadata"]): PostBadge;   // the data-model mapping table
deriveExcerpt(body: string, explicitExcerpt: string | null): string; // explicit wins; else first-prose derivation
deriveByline(authorId: string | null, authorHandle: string | null): string;  // null ⇒ studio/system byline
estimateReadTime(body: string): number;             // word-count / 200wpm, min 1
markFeatured(rows: PostSummary[]): PostSummary[];   // sets .featured per the data-model rule (metadata.featured override, else newest)
```

- Pure functions; the same input always yields the same output (testable in isolation, no DB).
- `toBadge` is the **single** implementation of the `type`/`category` → badge/tone table
  (data-model) — an unrecognized `type` or `metadata.category` always resolves to `NEWS`/`neutral`,
  never throws.

---

## 3. Safe markdown render (`src/lib/markdown.tsx`)

```ts
// Renders posts.body (markdown) to React elements in a Server Component.
// MUST NOT use dangerouslySetInnerHTML with unsanitized input (FR-012, SC-003, Principle II).
renderPostMarkdown(body: string): React.ReactNode;
```

**Guarantees (non-negotiable — Principle II, SC-003):**

1. Built on **`react-markdown` + `remark-gfm`** (research C1) — parses to a syntax tree and builds
   React elements; **never** passes a string through `dangerouslySetInnerHTML`.
2. **Raw HTML is disabled** (the `react-markdown` default) — any embedded `<script>`, `onerror=`
   attribute, or `javascript:` URL in `posts.body` is **stripped**, not rendered, not executed.
3. Renders the **supported subset**: headings, paragraphs, lists (ordered/unordered/task, via
   `remark-gfm`), blockquotes, links (safe `href` only — no `javascript:` scheme), inline/block
   images, code (inline + fenced), tables (via `remark-gfm`).
4. If raw HTML is ever enabled in a future version, it MUST go through `rehype-raw` **followed by**
   `rehype-sanitize` with an explicit tag/attribute allowlist (research C2) — never raw HTML
   unsanitized. v1 does not enable this path; the XSS test corpus (tasks.md) asserts the
   default-stripping behavior, not a sanitizer allowlist.
5. Used **everywhere** a post body/excerpt is derived — the article (`PostView.bodyHtml`), the
   auto-derived excerpt (`deriveExcerpt`), and the RSS feed summary — so there is exactly **one**
   markdown trust boundary, not one per caller.

---

## Contract guarantees

1. **Read-only** — no function here writes `posts`; Feature 12 + the auto-post triggers are the
   sole writers (P6, FR-016).
2. **Published-only, always** — every read constrains `status='published' AND publishedAt<=now()`
   in the query; a draft or future-dated post is **never** reachable through this surface, by index,
   teaser, slug, sitemap, or feed (SC-001).
3. **A draft slug 404s identically to an unknown slug** — `getPublishedPostBySlug` returns `null`
   for both; the caller cannot distinguish "doesn't exist" from "exists but is a draft" (FR-013,
   SC-004) — no information leak about unpublished content.
4. **Ordering is a pure function of stored data** — given the same published `posts`, `getPublishedPosts`
   yields the same `publishedAt DESC` order every call (SC-002); testable against an independent sort.
5. **Zero XSS survivors** — `renderPostMarkdown` never executes embedded script/event-handler/
   `javascript:` payloads, for any markdown body (SC-003).
6. **View-models only, never raw rows** — `PostSummary`/`PostView` are the only shapes a component
   imports from this surface; a raw `PostRaw`/`PostSummaryRaw` never crosses into `src/components/marketing/*`.
