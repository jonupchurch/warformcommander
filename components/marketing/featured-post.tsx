import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { formatPostDate, type PostSummary } from "@/lib/post-view";

import { PostBadge } from "./post-badge";

/**
 * The News-index featured lead item (T032, FR-008) — a larger card for the most-recent (or overridden)
 * published post. Spans the grid; degrades gracefully with no image.
 */
export function FeaturedPost({ post }: { post: PostSummary }) {
  return (
    <Panel as="article" radius="xl" className="group relative flex flex-col gap-4 p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <PostBadge badge={post.badge} />
        <span className="type-eyebrow text-faction-friendly">Featured</span>
        <time dateTime={post.publishedAt.toISOString()} className="type-eyebrow text-text-muted">
          {formatPostDate(post.publishedAt)}
        </time>
      </div>
      <h2 className="type-h1 max-w-3xl text-balance text-text-strong">
        <Link
          href={`/news/${post.slug}`}
          className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring group-hover:text-faction-friendly"
        >
          {post.title}
        </Link>
      </h2>
      {post.excerpt && <p className="type-body-lg max-w-prose text-text-muted">{post.excerpt}</p>}
    </Panel>
  );
}
