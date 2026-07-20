/**
 * Shared persistence — the unified posts table (FR-024/025). Authored (admin) and auto/system
 * (null-author) posts both work; publishing stamps status/publishedAt; the public index returns
 * published posts newest-first; slugs are unique; and authoring/publishing is admin-gated.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createPost,
  createSystemPost,
  publishPost,
  listPublished,
  getPostBySlug,
} from "@/server/posts";
import { truncateAll, closeDb, createTestUser } from "./db-setup";

beforeEach(truncateAll);
afterAll(closeDb);

describe("authoring + publishing (FR-024/025)", () => {
  it("an admin authors a post; a non-admin is refused", async () => {
    const admin = await createTestUser({ role: "admin" });
    const player = await createTestUser();

    const authored = await createPost(admin, {
      slug: "welcome",
      title: "Welcome",
      body: "# hi",
      type: "editorial",
    });
    expect(authored.ok).toBe(true);
    if (authored.ok) expect(authored.value.authorId).toBe(admin.id);

    const refused = await createPost(player, { slug: "nope", title: "x", body: "y", type: "editorial" });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe("FORBIDDEN");
  });

  it("supports auto/system posts with a null author", async () => {
    const sys = await createSystemPost({
      slug: "balance-2026-07-20",
      title: "Balance pass",
      body: "auto",
      type: "balance",
      metadata: { delta: { HeavyCannon: "+5%" } },
    });
    expect(sys.ok).toBe(true);
    if (sys.ok) expect(sys.value.authorId).toBeNull();
  });

  it("rejects a duplicate slug", async () => {
    const admin = await createTestUser({ role: "admin" });
    await createPost(admin, { slug: "dup", title: "a", body: "a", type: "devlog" });
    const again = await createPost(admin, { slug: "dup", title: "b", body: "b", type: "devlog" });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe("SLUG_TAKEN");
  });
});

describe("published index (public read)", () => {
  it("publishPost stamps status/publishedAt; listPublished is newest-first and drafts are excluded", async () => {
    const admin = await createTestUser({ role: "admin" });
    const draft = await createPost(admin, { slug: "d1", title: "Draft", body: "b", type: "devlog" });
    const live = await createPost(admin, {
      slug: "p1",
      title: "Published",
      body: "b",
      type: "devlog",
      status: "published",
    });
    expect(draft.ok && live.ok).toBe(true);
    if (!draft.ok) return;

    // Only the published one shows in the index.
    let index = await listPublished({});
    expect(index.ok && index.value).toHaveLength(1);

    // Publish the draft → now two, newest first.
    const pub = await publishPost(admin, draft.value.id);
    expect(pub.ok).toBe(true);
    if (pub.ok) {
      expect(pub.value.status).toBe("published");
      expect(pub.value.publishedAt).toBeInstanceOf(Date);
    }
    index = await listPublished({});
    expect(index.ok && index.value).toHaveLength(2);
    if (index.ok) {
      const times = index.value.map((p) => p.publishedAt!.getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a)); // DESC
    }

    // getPostBySlug reads an article; a non-admin cannot publish.
    const bySlug = await getPostBySlug("p1");
    expect(bySlug.ok && bySlug.value.title).toBe("Published");
    const player = await createTestUser();
    expect((await publishPost(player, live.ok ? live.value.id : "")).ok).toBe(false);
  });
});
