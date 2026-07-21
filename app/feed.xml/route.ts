import { getPublishedPosts } from "@/server/news";
import { deriveExcerpt } from "@/lib/post-view";

/**
 * RSS 2.0 feed of published posts (T054, FR-018), newest first — so the live devlog/changelog is
 * followable in a reader. Only published (non-future) posts appear (the read layer, SC-001).
 * Revalidated on publish via the `posts` seam + a time backstop.
 */
export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://warformcommander.vercel.app";
const FEED_CAP = 30;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(): Promise<Response> {
  const { rows } = await getPublishedPosts({ limit: FEED_CAP });

  const items = rows
    .map((post) => {
      const link = `${SITE_URL}/news/${post.slug}`;
      const summary = deriveExcerpt(post.body, post.excerpt);
      const pubDate = (post.publishedAt ?? post.createdAt).toUTCString();
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${pubDate}</pubDate>`,
        `      <description>${escapeXml(summary)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    "    <title>Warform Commander — Dispatches</title>",
    `    <link>${SITE_URL}/news</link>`,
    "    <description>Devlogs, balance notes, and changelog entries from Warform Commander.</description>",
    "    <language>en-us</language>",
    items,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
