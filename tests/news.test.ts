/**
 * Feature 11 — the published-only **read boundary** (`server/news.ts`), the single choke point that
 * guarantees drafts and future-dated posts are never public (SC-001/SC-002, FR-013/FR-015). Exercised
 * directly against the local dev Postgres so the guarantee is proven *in the query*, not in the UI.
 *
 * We insert rows **directly** (not via `createPost`/`createSystemPost`) because those helpers always
 * stamp `publishedAt = now()`; the future-dated and back-dated cases here need explicit timestamps.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/db";
import { posts } from "@/db/schema";
import type { PostType } from "@/server/posts";
import {
  getLatestPosts,
  getPublishedPostBySlug,
  getPublishedPosts,
  getPublishedSlugs,
} from "@/server/news";
import { closeDb, truncateAll } from "./db-setup";

beforeEach(truncateAll);
afterAll(closeDb);

/** A minute, in ms — for building relative timestamps without ambient `Date.now()` scatter. */
const MINUTE = 60_000;

interface SeedRow {
  slug: string;
  title?: string;
  type?: PostType;
  status?: "draft" | "published";
  /** `publishedAt`, as an offset in minutes from "now" (negative = past, positive = future). */
  publishedMinutesFromNow?: number | null;
}

/** Insert a post row with full control over status + publishedAt (what the service helpers hide). */
async function seed(row: SeedRow): Promise<void> {
  const now = new Date();
  const status = row.status ?? "published";
  const offset = row.publishedMinutesFromNow;
  const publishedAt =
    offset === null || offset === undefined
      ? status === "published"
        ? new Date(now.getTime() - MINUTE) // default: a minute ago
        : null
      : new Date(now.getTime() + offset * MINUTE);
  await getDb()
    .insert(posts)
    .values({
      slug: row.slug,
      title: row.title ?? row.slug,
      body: `# ${row.slug}\n\nBody.`,
      type: row.type ?? "devlog",
      status,
      authorId: null,
      publishedAt,
    });
}

describe("getPublishedPosts — the published-only list read (SC-001, SC-002)", () => {
  it("returns [] and total 0 against an empty posts table", async () => {
    const { rows, total } = await getPublishedPosts();
    expect(rows).toEqual([]);
    expect(total).toBe(0);
  });

  it("excludes drafts and future-dated posts; orders published newest-first", async () => {
    await seed({ slug: "oldest", publishedMinutesFromNow: -30 });
    await seed({ slug: "newest", publishedMinutesFromNow: -5 });
    await seed({ slug: "middle", publishedMinutesFromNow: -15 });
    await seed({ slug: "a-draft", status: "draft" });
    await seed({ slug: "future", publishedMinutesFromNow: +60 });

    const { rows, total } = await getPublishedPosts();

    expect(total).toBe(3); // the three published, non-future posts — never the draft or future one
    expect(rows.map((r) => r.slug)).toEqual(["newest", "middle", "oldest"]); // publishedAt DESC
    expect(rows.some((r) => r.slug === "a-draft")).toBe(false);
    expect(rows.some((r) => r.slug === "future")).toBe(false);
  });

  it("filters by type while staying published-only", async () => {
    await seed({ slug: "dev-1", type: "devlog", publishedMinutesFromNow: -10 });
    await seed({ slug: "bal-1", type: "balance", publishedMinutesFromNow: -5 });
    await seed({ slug: "bal-draft", type: "balance", status: "draft" });

    const { rows, total } = await getPublishedPosts({ type: "balance" });
    expect(total).toBe(1);
    expect(rows.map((r) => r.slug)).toEqual(["bal-1"]);
  });

  it("paginates via limit/offset over the published set", async () => {
    for (let i = 0; i < 5; i += 1) {
      // i=0 is oldest … i=4 is newest
      await seed({ slug: `p-${i}`, publishedMinutesFromNow: -(50 - i * 10) });
    }
    const page1 = await getPublishedPosts({ limit: 2, offset: 0 });
    const page2 = await getPublishedPosts({ limit: 2, offset: 2 });
    expect(page1.total).toBe(5);
    expect(page1.rows.map((r) => r.slug)).toEqual(["p-4", "p-3"]);
    expect(page2.rows.map((r) => r.slug)).toEqual(["p-2", "p-1"]);
  });
});

describe("getLatestPosts — the Home teaser read", () => {
  it("returns [] when there are no published posts", async () => {
    await seed({ slug: "only-a-draft", status: "draft" });
    expect(await getLatestPosts(3)).toEqual([]);
  });

  it("returns published-only rows newest-first, capped to the limit", async () => {
    await seed({ slug: "l-old", publishedMinutesFromNow: -30 });
    await seed({ slug: "l-new", publishedMinutesFromNow: -1 });
    await seed({ slug: "l-mid", publishedMinutesFromNow: -10 });
    await seed({ slug: "l-draft", status: "draft" });

    const latest = await getLatestPosts(2);
    expect(latest.map((r) => r.slug)).toEqual(["l-new", "l-mid"]);
  });
});

describe("getPublishedPostBySlug — the article read (SC-004, FR-013)", () => {
  it("returns a published, non-future post by slug", async () => {
    await seed({ slug: "live-article", title: "Live", publishedMinutesFromNow: -5 });
    const post = await getPublishedPostBySlug("live-article");
    expect(post?.title).toBe("Live");
  });

  it("returns null for an unknown slug", async () => {
    expect(await getPublishedPostBySlug("does-not-exist")).toBeNull();
  });

  it("returns null for a draft slug — indistinguishable from unknown (a draft is never reachable)", async () => {
    await seed({ slug: "secret-draft", status: "draft" });
    expect(await getPublishedPostBySlug("secret-draft")).toBeNull();
  });

  it("returns null for a future-dated slug", async () => {
    await seed({ slug: "embargoed", publishedMinutesFromNow: +120 });
    expect(await getPublishedPostBySlug("embargoed")).toBeNull();
  });

  it("returns null for an empty slug without hitting the DB", async () => {
    expect(await getPublishedPostBySlug("")).toBeNull();
  });
});

describe("getPublishedSlugs — the generateStaticParams source", () => {
  it("returns only published slugs (drafts + future excluded), newest-first", async () => {
    await seed({ slug: "s-old", publishedMinutesFromNow: -20 });
    await seed({ slug: "s-new", publishedMinutesFromNow: -2 });
    await seed({ slug: "s-draft", status: "draft" });
    await seed({ slug: "s-future", publishedMinutesFromNow: +30 });

    const slugs = await getPublishedSlugs();
    expect(slugs).toEqual(["s-new", "s-old"]);
  });

  it("returns [] against an empty table", async () => {
    expect(await getPublishedSlugs()).toEqual([]);
  });
});
