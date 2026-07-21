import { formatPostDate, type PostView } from "@/lib/post-view";

import { PostBadge } from "./post-badge";

/** The article header (T043, FR-011): type badge + title + meta line (byline · date · read time). */
export function ArticleHeader({ post }: { post: PostView }) {
  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <PostBadge badge={post.badge} />
      </div>
      <h1 className="type-display text-balance text-text-strong">{post.title}</h1>
      <div className="type-label flex flex-wrap items-center gap-x-3 gap-y-1 text-text-muted">
        <span>{post.byline}</span>
        <span aria-hidden className="text-text-faint">
          ·
        </span>
        <time dateTime={post.publishedAt.toISOString()}>{formatPostDate(post.publishedAt)}</time>
        <span aria-hidden className="text-text-faint">
          ·
        </span>
        <span>{post.readTimeMinutes} min read</span>
      </div>
    </header>
  );
}
