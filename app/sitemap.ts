import type { MetadataRoute } from "next";

import { getPublishedPosts } from "@/server/news";

/**
 * Sitemap (T052, FR-018) — `/`, `/news`, and each **published** article (`lastModified = updatedAt`).
 * Drafts/future posts are excluded because the read layer never returns them (SC-001). Resilient: an
 * unreachable DB yields just the static routes. Revalidated on publish via the `posts` seam.
 */
export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://warformcommander.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { rows } = await getPublishedPosts({ limit: 50 });

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/news`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
  ];

  const articles: MetadataRoute.Sitemap = rows.map((post) => ({
    url: `${SITE_URL}/news/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...articles];
}
