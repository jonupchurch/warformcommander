/**
 * Feature 11 — the public **news read layer** and its trust boundary (T005, contract §1). The
 * **only** path any marketing page / SEO surface reads `posts` through, and the single choke point
 * that guarantees **drafts (and future-dated posts) are never public** (FR-013/FR-015, SC-001):
 * every query is constrained, **in the query**, to
 *
 *   status = 'published' AND published_at IS NOT NULL AND published_at <= now()
 *
 * ordered by `published_at DESC` (hits Feature 7's `posts_published_idx`). Read-only — this feature
 * never writes `posts` (FR-016); Feature 12 + the auto-post triggers are the sole writers.
 *
 * **Resilience (deliberate):** these reads are called at **build time** (static prerender +
 * `generateStaticParams`) as well as at request/ISR time. The marketing pages must build even when
 * no database is reachable (the prod DB migration is user-gated), and must render a graceful empty
 * state when there are zero published posts. So every read **catches** a data-access failure and
 * returns an empty result rather than throwing — the empty state renders now, and on-demand/ISR
 * revalidation fills it once the DB is live (SC-007). A raw draft/future row is never returned.
 *
 * Server-only by usage (imported solely by the marketing routes + SEO surfaces).
 */

import { and, count, desc, eq, isNotNull, lte } from "drizzle-orm";

import { getDb } from "@/db";
import { posts } from "@/db/schema";

import { type Post, type PostType } from "./posts";

export type { Post, PostType };

/** The published-only predicate — the trust-boundary invariant, applied to every read below. */
function publishedPredicate() {
  return and(eq(posts.status, "published"), isNotNull(posts.publishedAt), lte(posts.publishedAt, new Date()));
}

/** Options for the News-index / feed / sitemap list read. */
export interface ListPublishedOpts {
  /** Page size, clamped to a sane maximum. */
  limit?: number;
  /** Simple offset paging (v1 scale). */
  offset?: number;
  /** Type filter (FR-010); omitted ⇒ all types. */
  type?: PostType;
}

const MAX_LIMIT = 50;

/**
 * The News index / Home teaser / sitemap / feed read: published, not-future posts newest-first, plus
 * the total count (for pagination). Never returns a draft or future post.
 */
export async function getPublishedPosts(
  opts: ListPublishedOpts = {},
): Promise<{ rows: Post[]; total: number }> {
  const limit = Math.min(Math.max(1, opts.limit ?? 20), MAX_LIMIT);
  const offset = Math.max(0, opts.offset ?? 0);
  const where = opts.type ? and(publishedPredicate(), eq(posts.type, opts.type)) : publishedPredicate();
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(posts)
      .where(where)
      .orderBy(desc(posts.publishedAt))
      .limit(limit)
      .offset(offset);
    const [{ n }] = await db.select({ n: count() }).from(posts).where(where);
    return { rows, total: Number(n) };
  } catch (error) {
    console.warn("[news] getPublishedPosts failed; serving empty (DB unreachable at build?)", error);
    return { rows: [], total: 0 };
  }
}

/**
 * A single article by slug — **published and not-future only**. Returns `null` for an unknown slug
 * *or* a draft/future-dated slug: the two are indistinguishable to the caller (FR-013, SC-004), so
 * a draft is never reachable by guessing its URL.
 */
export async function getPublishedPostBySlug(slug: string): Promise<Post | null> {
  if (!slug) return null;
  try {
    const [row] = await getDb()
      .select()
      .from(posts)
      .where(and(publishedPredicate(), eq(posts.slug, slug)))
      .limit(1);
    return row ?? null;
  } catch (error) {
    console.warn("[news] getPublishedPostBySlug failed; treating as not-found", error);
    return null;
  }
}

/** The N most recent published posts — the Home teaser read. `[]` when there are none. */
export async function getLatestPosts(limit: number): Promise<Post[]> {
  const { rows } = await getPublishedPosts({ limit });
  return rows;
}

/** Every published slug — the `generateStaticParams()` source (build-time prerender). `[]` on failure. */
export async function getPublishedSlugs(): Promise<string[]> {
  try {
    const rows = await getDb()
      .select({ slug: posts.slug })
      .from(posts)
      .where(publishedPredicate())
      .orderBy(desc(posts.publishedAt));
    return rows.map((r) => r.slug);
  } catch (error) {
    console.warn("[news] getPublishedSlugs failed; prerendering no slugs", error);
    return [];
  }
}
