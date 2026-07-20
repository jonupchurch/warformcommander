/**
 * Unified news-posts service (Feature 7, shared persistence — §16.2). One table serves editorial
 * (Feature 11), balance, and devlog/changelog (Feature 12 auto-publish) posts. This feature owns the
 * table + the guarded operations; those features own the authoring UI and the auto-post triggers.
 *
 * `listPublished` / `getPostBySlug` are the only **public** (no-session) reads (the News index and
 * article pages). Authoring/publishing is admin-gated; auto-published posts carry a null author.
 *
 * Server-only.
 */

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { posts } from "@/db/schema";

import { type SessionUser } from "./authz";
import { err, ok, type Result } from "./result";

export type Post = typeof posts.$inferSelect;
export type PostType = Post["type"];

interface PostInput {
  slug: string;
  title: string;
  body: string;
  type: PostType;
  excerpt?: string;
  metadata?: unknown;
  status?: "draft" | "published";
}

async function slugTaken(slug: string): Promise<boolean> {
  const rows = await getDb().select({ id: posts.id }).from(posts).where(eq(posts.slug, slug)).limit(1);
  return rows.length > 0;
}

function insertValues(input: PostInput, authorId: string | null) {
  const status = input.status ?? "draft";
  return {
    slug: input.slug,
    title: input.title,
    body: input.body,
    type: input.type,
    excerpt: input.excerpt,
    metadata: input.metadata,
    status,
    authorId,
    publishedAt: status === "published" ? new Date() : null,
  };
}

/** Create an **authored** post (admin-gated). The signed-in admin is recorded as the author. */
export async function createPost(actor: SessionUser, input: PostInput): Promise<Result<Post>> {
  if (actor.role !== "admin") return err("FORBIDDEN", "admin role required to author posts");
  if (await slugTaken(input.slug)) return err("SLUG_TAKEN", `slug '${input.slug}' is in use`);
  const [row] = await getDb().insert(posts).values(insertValues(input, actor.id)).returning();
  return ok(row);
}

/**
 * Create an **auto-published/system** post with no human author (a code push or a balance edit, driven
 * by Feature 12). Server-only — there is no actor because no user authored it (FR-024/025).
 */
export async function createSystemPost(input: PostInput): Promise<Result<Post>> {
  if (await slugTaken(input.slug)) return err("SLUG_TAKEN", `slug '${input.slug}' is in use`);
  const [row] = await getDb().insert(posts).values(insertValues(input, null)).returning();
  return ok(row);
}

/** Publish a draft (admin-gated): set `status='published'` and stamp `publishedAt`. */
export async function publishPost(actor: SessionUser, id: string): Promise<Result<Post>> {
  if (actor.role !== "admin") return err("FORBIDDEN", "admin role required to publish");
  const now = new Date();
  const [row] = await getDb()
    .update(posts)
    .set({ status: "published", publishedAt: now, updatedAt: now })
    .where(eq(posts.id, id))
    .returning();
  if (!row) return err("NOT_FOUND");
  return ok(row);
}

/** The published News index (public), newest first. Optionally filtered by type. */
export async function listPublished(
  opts: { type?: PostType; limit?: number; offset?: number } = {},
): Promise<Result<Post[]>> {
  const conds = [eq(posts.status, "published")];
  if (opts.type) conds.push(eq(posts.type, opts.type));
  const rows = await getDb()
    .select()
    .from(posts)
    .where(and(...conds))
    .orderBy(desc(posts.publishedAt))
    .limit(opts.limit ?? 20)
    .offset(opts.offset ?? 0);
  return ok(rows);
}

/** A single article by slug (public). */
export async function getPostBySlug(slug: string): Promise<Result<Post>> {
  const [row] = await getDb().select().from(posts).where(eq(posts.slug, slug)).limit(1);
  if (!row) return err("NOT_FOUND");
  return ok(row);
}
