import type { MetadataRoute } from "next";

/**
 * Robots policy (T053, FR-018) — allow indexing of the public marketing routes; keep the
 * authenticated app + API off the crawl; point at the sitemap.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://warformcommander.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/garage", "/arena", "/practice", "/ladder", "/profile", "/matches", "/battle"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
