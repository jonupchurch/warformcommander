/**
 * Feature 11 — pure view-model mapping (T006, contract §2). `posts` rows → the `PostSummary` /
 * `PostView` / `PostBadge` shapes the marketing views render. **No data access** — pure functions,
 * same input → same output, testable in isolation. A component never sees a raw `posts` row; it only
 * ever imports these view-models (data-model §"Assembly & trust boundary", Principle II).
 */

import type React from "react";

import { markdownToPlainText, renderPostMarkdown } from "@/lib/markdown";
import type { Post, PostType } from "@/server/posts";

/** The subset of Feature 3 `Chip` tones a post badge uses (a subset of the full Chip tone union). */
export type PostBadgeTone = "friendly" | "energy" | "air" | "enemy" | "neutral";

/** The display badge + Feature 3 `Chip` tone for a post (the mapping table below). */
export interface PostBadge {
  label: string;
  tone: PostBadgeTone;
}

/** News-index card / featured item / Home teaser projection. */
export interface PostSummary {
  slug: string;
  title: string;
  excerpt: string;
  badge: PostBadge;
  publishedAt: Date;
  image: string | null;
  featured: boolean;
}

/** The article page's full projection — `PostSummary` plus the safely-rendered body + meta. */
export interface PostView extends PostSummary {
  bodyHtml: React.ReactNode;
  byline: string;
  readTimeMinutes: number;
  ogImage: string;
  metadata: Record<string, unknown> | null;
}

/** The default OpenGraph / lead image when a post carries none (resolved absolute via metadataBase). */
export const DEFAULT_OG_IMAGE = "/og-default.png";

/** Studio byline for auto-posted / system posts (null author). */
const STUDIO_BYLINE = "Warform Command";

/** Safely read `metadata` (jsonb `unknown`) as a string-keyed object. */
function asRecord(metadata: unknown): Record<string, unknown> | null {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null;
}

function stringField(meta: Record<string, unknown> | null, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * The `type` (+ editorial `metadata.category`) → badge/tone mapping (data-model table). The **single**
 * implementation. An unrecognized `type` or category always falls back to `NEWS`/`neutral` — never
 * throws (edge case).
 */
export function toBadge(type: PostType | string, metadata: unknown): PostBadge {
  switch (type) {
    case "devlog":
    case "changelog": // both are code-push artifacts — share the DEVLOG badge
      return { label: "DEVLOG", tone: "friendly" };
    case "balance":
      return { label: "BALANCE", tone: "energy" };
    case "editorial": {
      const category = stringField(asRecord(metadata), "category")?.toLowerCase();
      switch (category) {
        case "design":
          return { label: "DESIGN", tone: "energy" };
        case "tech":
          return { label: "TECH", tone: "air" };
        case "community":
          return { label: "COMMUNITY", tone: "enemy" };
        default:
          return { label: "NEWS", tone: "neutral" };
      }
    }
    default:
      return { label: "NEWS", tone: "neutral" };
  }
}

/** Explicit excerpt wins; else derive from the body's first prose, trimmed to a card-friendly length. */
export function deriveExcerpt(body: string, explicitExcerpt: string | null): string {
  if (explicitExcerpt && explicitExcerpt.trim().length > 0) return explicitExcerpt.trim();
  const plain = markdownToPlainText(body ?? "");
  if (plain.length <= 200) return plain;
  // Trim to the last word boundary before 200 chars, add an ellipsis.
  const cut = plain.slice(0, 200);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 120 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** A human byline: the author's handle, or the studio byline when there is no author (auto-post). */
export function deriveByline(authorId: string | null, authorHandle: string | null): string {
  if (!authorId) return STUDIO_BYLINE;
  return authorHandle && authorHandle.length > 0 ? authorHandle : STUDIO_BYLINE;
}

/** Format a publish date for display (stable, locale-fixed so server and client agree). */
export function formatPostDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Estimated read time in minutes from the body word count (≈200 wpm, minimum 1). */
export function estimateReadTime(body: string): number {
  const words = markdownToPlainText(body ?? "")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Map a published `posts` row to a `PostSummary`. `publishedAt` is guaranteed non-null upstream. */
export function toPostSummary(post: Post): PostSummary {
  const meta = asRecord(post.metadata);
  return {
    slug: post.slug,
    title: post.title,
    excerpt: deriveExcerpt(post.body, post.excerpt),
    badge: toBadge(post.type, post.metadata),
    publishedAt: post.publishedAt ?? post.createdAt,
    image: stringField(meta, "image"),
    featured: false,
  };
}

/** Map a published `posts` row to the article `PostView` (adds the safely-rendered body + meta). */
export function toPostView(post: Post, authorHandle: string | null = null): PostView {
  const meta = asRecord(post.metadata);
  const summary = toPostSummary(post);
  return {
    ...summary,
    bodyHtml: renderPostMarkdown(post.body),
    byline: deriveByline(post.authorId, authorHandle),
    readTimeMinutes: estimateReadTime(post.body),
    ogImage: stringField(meta, "ogImage") ?? summary.image ?? DEFAULT_OG_IMAGE,
    metadata: meta,
  };
}

/**
 * Mark exactly one summary as featured (data-model rule): a post whose `metadata.featured === true`
 * wins; otherwise the first (most-recently-published, since the list is already `publishedAt DESC`).
 * Pure — returns new objects, never mutates the input.
 */
export function markFeatured(rows: PostSummary[], raw?: Post[]): PostSummary[] {
  if (rows.length === 0) return rows;
  let featuredIndex = 0;
  if (raw && raw.length === rows.length) {
    const override = raw.findIndex((p) => asRecord(p.metadata)?.featured === true);
    if (override >= 0) featuredIndex = override;
  }
  return rows.map((r, i) => (i === featuredIndex ? { ...r, featured: true } : { ...r, featured: false }));
}
