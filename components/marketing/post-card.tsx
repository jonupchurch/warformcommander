import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { formatPostDate, type PostSummary } from "@/lib/post-view";

import { PostBadge } from "./post-badge";

/**
 * A News-index grid card (T033, FR-008): type badge, date, title, and excerpt, the whole card linking
 * to its article. Degrades gracefully when a post has no excerpt/image.
 */
export function PostCard({ post }: { post: PostSummary }) {
  return (
    <Panel as="article" className="group relative flex flex-col gap-3 transition-colors hover:bg-surface-raised">
      <div className="flex items-center justify-between gap-3">
        <PostBadge badge={post.badge} />
        <time dateTime={post.publishedAt.toISOString()} className="type-eyebrow text-text-muted">
          {formatPostDate(post.publishedAt)}
        </time>
      </div>
      <h3 className="type-h3 text-text-strong">
        <Link
          href={`/news/${post.slug}`}
          className="rounded-sm outline-none after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring group-hover:text-faction-friendly"
        >
          {post.title}
        </Link>
      </h3>
      {post.excerpt && <p className="type-body-sm line-clamp-3 text-text-muted">{post.excerpt}</p>}
    </Panel>
  );
}
