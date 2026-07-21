import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { Panel } from "@/components/ui/panel";
import type { PostSummary } from "@/lib/post-view";

import { PostCard } from "./post-card";

/**
 * The Home latest-news teaser (T017, FR-003): the most recent published posts, or a graceful
 * placeholder when there are none (empty `posts` table / DB not yet live). Never breaks the page.
 */
export function NewsTeaser({ posts }: { posts: PostSummary[] }) {
  return (
    <section className="px-safe mx-auto max-w-shell py-16 sm:py-24">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <SectionLabel index="04" className="min-w-0 flex-1">Latest dispatches</SectionLabel>
        <Button asChild variant="ghost" size="sm">
          <Link href="/news">All news →</Link>
        </Button>
      </div>

      {posts.length === 0 ? (
        <Panel inset="sunken" className="mt-10">
          <p className="type-body text-text-muted">
            No dispatches yet — devlogs, balance notes, and changelog entries will land here.
          </p>
        </Panel>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}
