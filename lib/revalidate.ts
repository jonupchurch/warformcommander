/**
 * Feature 11 — the F11↔F12 revalidation seam (T008, contract §3, FR-019). This feature **defines**
 * the cache tag / path names and the revalidation entry point; **Feature 12** (and the code-push /
 * balance-edit auto-post triggers) **calls** `revalidatePostsPublish(slug)` after a post is published
 * or a published post changes — never the reverse (a clean one-way dependency; F11 never imports F12).
 *
 * A newly published post then surfaces across the News index, its article, the sitemap, and the feed
 * **without a redeploy** (SC-007), backed additionally by each route's time-based `revalidate` window.
 *
 * Must be invoked from a Server Action or Route Handler (Next's `revalidatePath`/`revalidateTag`
 * requirement) — Feature 12's admin publish action is that call site.
 */

import { revalidatePath } from "next/cache";

/**
 * The cache-tag names this feature **defines** for the news reads (the seam Feature 12 references).
 * v1 revalidates by **path** (below) — the marketing reads aren't wrapped in `cacheTag`/`unstable_cache`
 * yet — so these are the agreed tag names for when tag-based data caching is wired, not live tags.
 */
export const POSTS_TAG = "posts";

/** The cache tag for a single article. */
export const postTag = (slug: string): string => `post:${slug}`;

/**
 * Revalidate every public surface affected by publishing (or editing) the post `slug`. Path-based
 * revalidation covers all the concrete marketing routes + SEO surfaces, so a newly published post
 * appears across the index, its article, the sitemap, and the feed **without a redeploy** (SC-007).
 * SWR semantics — the public reader tolerates a brief stale-then-fresh window.
 */
export async function revalidatePostsPublish(slug: string): Promise<void> {
  revalidatePath("/"); // Home latest-news teaser
  revalidatePath("/news"); // the index
  if (slug) revalidatePath(`/news/${slug}`, "page"); // the article
  revalidatePath("/sitemap.xml"); // the sitemap
  revalidatePath("/feed.xml"); // the RSS feed
}
