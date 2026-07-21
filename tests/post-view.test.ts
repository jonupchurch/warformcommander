/**
 * Feature 11 view-model mapping (T006/T011/T026/T027/T039) — pure, DB-free. The badge table
 * (`type`/`metadata.category` → label/tone with a `NEWS`/`neutral` fallback), excerpt derivation
 * (explicit wins, else first-prose), byline (null author ⇒ studio), read-time (≥1), and the
 * exactly-one-featured rule (metadata.featured override, else newest).
 */

import { describe, expect, it } from "vitest";

import {
  deriveByline,
  deriveExcerpt,
  estimateReadTime,
  markFeatured,
  toBadge,
  toPostSummary,
  type PostSummary,
} from "@/lib/post-view";
import type { Post } from "@/server/posts";

function post(over: Partial<Post> = {}): Post {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    slug: "a-post",
    title: "A Post",
    excerpt: null,
    body: "# Heading\n\nSome **bold** prose to derive an excerpt from.",
    type: "editorial",
    status: "published",
    authorId: null,
    metadata: null,
    publishedAt: new Date("2026-07-20T00:00:00Z"),
    createdAt: new Date("2026-07-19T00:00:00Z"),
    updatedAt: new Date("2026-07-20T00:00:00Z"),
    ...over,
  } as Post;
}

describe("toBadge (the data-model mapping table)", () => {
  it("maps each type + editorial category, falling back to NEWS/neutral", () => {
    expect(toBadge("devlog", null)).toEqual({ label: "DEVLOG", tone: "friendly" });
    expect(toBadge("changelog", null)).toEqual({ label: "DEVLOG", tone: "friendly" });
    expect(toBadge("balance", null)).toEqual({ label: "BALANCE", tone: "energy" });
    expect(toBadge("editorial", { category: "design" })).toEqual({ label: "DESIGN", tone: "energy" });
    expect(toBadge("editorial", { category: "tech" })).toEqual({ label: "TECH", tone: "air" });
    expect(toBadge("editorial", { category: "community" })).toEqual({ label: "COMMUNITY", tone: "enemy" });
    expect(toBadge("editorial", null)).toEqual({ label: "NEWS", tone: "neutral" });
    expect(toBadge("editorial", { category: "nonsense" })).toEqual({ label: "NEWS", tone: "neutral" });
    // An unrecognized type never throws — always NEWS/neutral.
    expect(toBadge("mystery" as Post["type"], null)).toEqual({ label: "NEWS", tone: "neutral" });
  });
});

describe("deriveExcerpt", () => {
  it("prefers an explicit excerpt", () => {
    expect(deriveExcerpt("# body", "Hand-written summary")).toBe("Hand-written summary");
  });

  it("derives first prose from the body markdown when there is no excerpt", () => {
    const ex = deriveExcerpt("## Title\n\nThe **first** prose line, [linked](https://x).", null);
    expect(ex).toContain("The first prose line");
    expect(ex).not.toContain("#");
    expect(ex).not.toContain("**");
    expect(ex).not.toContain("https://x");
  });

  it("truncates a long body with an ellipsis", () => {
    const long = "word ".repeat(100);
    const ex = deriveExcerpt(long, null);
    expect(ex.length).toBeLessThanOrEqual(202);
    expect(ex.endsWith("…")).toBe(true);
  });
});

describe("deriveByline", () => {
  it("uses the studio byline for a null author (auto-post)", () => {
    expect(deriveByline(null, null)).toBe("Warform Command");
    expect(deriveByline(null, "ignored")).toBe("Warform Command");
  });

  it("uses the author handle when present", () => {
    expect(deriveByline("u1", "ACE")).toBe("ACE");
    expect(deriveByline("u1", null)).toBe("Warform Command"); // deleted handle falls back
  });
});

describe("estimateReadTime", () => {
  it("is at least 1 minute for a short body", () => {
    expect(estimateReadTime("a few words")).toBe(1);
    expect(estimateReadTime("")).toBe(1);
  });

  it("scales with word count (~200 wpm)", () => {
    expect(estimateReadTime("word ".repeat(600))).toBe(3);
  });
});

describe("toPostSummary", () => {
  it("projects a row: derived excerpt, badge, image from metadata, not-yet-featured", () => {
    const s = toPostSummary(post({ type: "balance", metadata: { image: "/x.png" }, excerpt: "Δ" }));
    expect(s.slug).toBe("a-post");
    expect(s.excerpt).toBe("Δ");
    expect(s.badge).toEqual({ label: "BALANCE", tone: "energy" });
    expect(s.image).toBe("/x.png");
    expect(s.featured).toBe(false);
  });
});

describe("markFeatured (exactly one)", () => {
  const summaries = (): PostSummary[] =>
    ["a", "b", "c"].map((slug) => ({
      slug,
      title: slug,
      excerpt: "",
      badge: { label: "NEWS", tone: "neutral" },
      publishedAt: new Date(),
      image: null,
      featured: false,
    }));

  it("features the newest (first) when there is no override", () => {
    const out = markFeatured(summaries());
    expect(out.filter((s) => s.featured)).toHaveLength(1);
    expect(out[0].featured).toBe(true);
  });

  it("a metadata.featured override wins over recency", () => {
    const raw = [post({ slug: "a" }), post({ slug: "b", metadata: { featured: true } }), post({ slug: "c" })];
    const out = markFeatured(summaries(), raw);
    expect(out.filter((s) => s.featured)).toHaveLength(1);
    expect(out[1].featured).toBe(true);
    expect(out[0].featured).toBe(false);
  });
});
