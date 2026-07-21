/**
 * `recordDevlogPost` (Feature 12, US4) — the durable "code push → news" rule made mechanical. A real
 * production deploy of a pushed commit auto-publishes one `devlog` (or `changelog` for a tagged
 * release) post from the commit metadata, with **no human author** (`authorId` null). Called only by
 * the secret-gated webhook route (`app/api/admin/devlog/route.ts`) — never a user session.
 *
 * **Idempotent by commit SHA**: the slug is derived from the SHA and `posts.slug` is unique, so a
 * retried hook delivery is a silent no-op (`ON CONFLICT DO NOTHING`) — exactly one post per commit
 * (FR-018, US4-AS2). Server-only.
 */

import { getDb } from "@/db";
import { posts } from "@/db/schema";

export interface DevlogPayload {
  sha: string;
  message: string;
  author: string;
  compareUrl: string;
  branch: string;
  deploymentUrl?: string;
  /** Present ⇒ a tagged release → `type='changelog'` instead of `'devlog'`. */
  tag?: string;
}

export interface DevlogResult {
  created: boolean;
  postId?: string;
}

/** The first line of a commit message — the human-readable summary. */
function summaryLine(message: string): string {
  const first = message.split("\n", 1)[0]?.trim();
  return first && first.length > 0 ? first : "";
}

/** The markdown body of a devlog post: the full message + author + a compare link. */
function renderCommitBody(p: DevlogPayload): string {
  const sha7 = p.sha.slice(0, 7);
  const lines = [p.message.trim(), "", `— ${p.author} · [\`${sha7}\`](${p.compareUrl})`];
  if (p.tag) lines.push("", `Release: **${p.tag}**`);
  return lines.join("\n");
}

/**
 * Insert one devlog/changelog post for a commit, idempotently by SHA. Returns `{ created: false }`
 * (no `postId`) when a post for this commit already exists (a retried delivery).
 */
export async function recordDevlogPost(p: DevlogPayload): Promise<DevlogResult> {
  const sha7 = p.sha.slice(0, 7);
  const isRelease = Boolean(p.tag);
  const summary = summaryLine(p.message);

  const [row] = await getDb()
    .insert(posts)
    .values({
      slug: `${isRelease ? "changelog" : "devlog"}-${sha7}`,
      title: summary || `Deploy ${sha7}`,
      excerpt: summary || undefined,
      body: renderCommitBody(p),
      type: isRelease ? "changelog" : "devlog",
      status: "published",
      authorId: null, // no human author (FR-017)
      metadata: {
        sha: p.sha,
        author: p.author,
        message: p.message,
        compareUrl: p.compareUrl,
        deploymentUrl: p.deploymentUrl,
        branch: p.branch,
        tag: p.tag,
      },
      publishedAt: new Date(),
    })
    .onConflictDoNothing({ target: posts.slug })
    .returning({ id: posts.id });

  return row ? { created: true, postId: row.id } : { created: false };
}
