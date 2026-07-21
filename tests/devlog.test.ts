/**
 * Feature 12 — the code-push devlog webhook (US4). The trust boundary is a shared secret, not a role
 * (no user session): a bad/absent secret is 401 with no write (SC-005, US2-AS5). A valid delivery
 * auto-publishes one `devlog` post (authorId null) from the commit metadata; a retried delivery of the
 * same SHA is a silent no-op (idempotent, US4-AS2); a tagged release posts `changelog`; a non-main
 * deploy posts nothing (US4-AS4). Integration against the local dev Postgres.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { closeDb, truncateAll } from "./db-setup";

const SECRET = "test-devlog-secret-abc123";

beforeAll(() => {
  process.env.DEVLOG_WEBHOOK_SECRET = SECRET;
});
beforeEach(truncateAll);
afterAll(closeDb);

const { POST } = await import("@/app/api/admin/devlog/route");

function devlogRequest(body: unknown, secret?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== undefined) headers.authorization = `Bearer ${secret}`;
  return new Request("http://local/api/admin/devlog", { method: "POST", headers, body: JSON.stringify(body) });
}

const PUSH = {
  sha: "abc1234def5678",
  message: "F12: admin console + balance publishing\n\nThe live-ops surface.",
  author: "Jon Upchurch",
  compareUrl: "https://github.com/jonupchurch/warformcommander/compare/aaa...abc1234",
  branch: "main",
};

describe("POST /api/admin/devlog — secret gate (SC-005, US2-AS5)", () => {
  it("rejects a missing secret with 401 and writes nothing", async () => {
    const res = await POST(devlogRequest(PUSH));
    expect(res.status).toBe(401);
    expect(await getDb().select().from(posts)).toHaveLength(0);
  });

  it("rejects an invalid secret with 401 and writes nothing", async () => {
    const res = await POST(devlogRequest(PUSH, "wrong-secret"));
    expect(res.status).toBe(401);
    expect(await getDb().select().from(posts)).toHaveLength(0);
  });
});

describe("POST /api/admin/devlog — publishing (SC-005)", () => {
  it("creates one devlog post (authorId null) from the commit metadata", async () => {
    const res = await POST(devlogRequest(PUSH, SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ created: true });

    const rows = await getDb().select().from(posts);
    expect(rows).toHaveLength(1);
    const post = rows[0];
    expect(post.type).toBe("devlog");
    expect(post.status).toBe("published");
    expect(post.authorId).toBeNull();
    expect(post.slug).toBe("devlog-abc1234");
    expect(post.title).toBe("F12: admin console + balance publishing");
    expect((post.metadata as { sha: string }).sha).toBe(PUSH.sha);
    expect(post.body).toContain(PUSH.compareUrl);
  });

  it("is idempotent by SHA — a retried delivery creates no duplicate (US4-AS2)", async () => {
    const first = await POST(devlogRequest(PUSH, SECRET));
    expect(await first.json()).toMatchObject({ created: true });
    const second = await POST(devlogRequest(PUSH, SECRET));
    expect(await second.json()).toMatchObject({ created: false });
    expect(await getDb().select().from(posts).where(eq(posts.slug, "devlog-abc1234"))).toHaveLength(1);
  });

  it("posts type='changelog' for a tagged release", async () => {
    const res = await POST(devlogRequest({ ...PUSH, tag: "v1.0.0" }, SECRET));
    expect(res.status).toBe(200);
    const [post] = await getDb().select().from(posts);
    expect(post.type).toBe("changelog");
    expect(post.slug).toBe("changelog-abc1234");
  });

  it("does not post for a non-main deploy (US4-AS4)", async () => {
    const res = await POST(devlogRequest({ ...PUSH, branch: "feature/x" }, SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ created: false });
    expect(await getDb().select().from(posts)).toHaveLength(0);
  });

  it("returns 400 for a payload missing required fields", async () => {
    const res = await POST(devlogRequest({ sha: "x" }, SECRET));
    expect(res.status).toBe(400);
  });
});
