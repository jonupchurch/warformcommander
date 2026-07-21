import type { Metadata } from "next";

import { SectionLabel } from "@/components/ui/section-label";
import { Panel } from "@/components/ui/panel";
import { CategoryFilter } from "@/components/marketing/category-filter";
import { FeaturedPost } from "@/components/marketing/featured-post";
import { PostCard } from "@/components/marketing/post-card";
import { NewsPagination } from "@/components/marketing/news-pagination";
import { getPublishedPosts, type PostType } from "@/server/news";
import { markFeatured, toPostSummary } from "@/lib/post-view";

/**
 * News index "/news" (US3) — the published news feed: a featured lead + a grid of recent posts, each
 * with a type badge, date, title, and excerpt, newest first, paginated and type-filterable. Only
 * published (non-future) posts appear — the read layer is the single choke point (SC-001, SC-002).
 * Static-first with a revalidation backstop + the on-demand `posts` seam.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "News",
  description:
    "Dispatches from Warform Commander — devlogs, balance notes, and changelog entries as the game evolves.",
  openGraph: {
    title: "News · Warform Commander",
    description: "Devlogs, balance notes, and changelog entries as the game evolves.",
    images: ["/og-default.png"],
  },
};

const PAGE_SIZE = 9;
const VALID_TYPES: PostType[] = ["editorial", "balance", "devlog", "changelog"];

function parseType(raw: string | string[] | undefined): PostType | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return VALID_TYPES.includes(value as PostType) ? (value as PostType) : undefined;
}

function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export default async function NewsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const type = parseType(sp.type);
  const requestedPage = parsePage(sp.page);

  // First read to learn the total, then clamp the page and read the actual window.
  const { total } = await getPublishedPosts({ type, limit: 1 });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const { rows } = await getPublishedPosts({ type, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  const summaries = markFeatured(rows.map(toPostSummary), rows);
  const featured = summaries.find((s) => s.featured) ?? null;
  const rest = summaries.filter((s) => !s.featured);

  const makeHref = (p: number) => (type ? `/news?type=${type}&page=${p}` : `/news?page=${p}`);

  return (
    <div className="px-safe mx-auto max-w-shell py-12 sm:py-16">
      <SectionLabel>News feed</SectionLabel>
      <h1 className="type-h1 mt-6 text-text-strong">Dispatches</h1>
      <div className="mt-8">
        <CategoryFilter />
      </div>

      {total === 0 ? (
        <Panel inset="sunken" className="mt-10 text-center">
          <p className="type-body text-text-muted">No dispatches yet — check back soon.</p>
        </Panel>
      ) : (
        <>
          {featured && (
            <div className="mt-10">
              <FeaturedPost post={featured} />
            </div>
          )}
          {rest.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {rest.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </div>
          )}
          <NewsPagination page={page} totalPages={totalPages} makeHref={makeHref} />
        </>
      )}
    </div>
  );
}
