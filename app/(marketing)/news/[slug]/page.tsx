import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleHeader } from "@/components/marketing/article-header";
import { ArticleBody } from "@/components/marketing/article-body";
import { getPublishedPostBySlug, getPublishedSlugs } from "@/server/news";
import { toPostView } from "@/lib/post-view";

/**
 * Article "/news/[slug]" (US4) — a single **published** post rendered safely from markdown. An unknown
 * OR draft/future slug 404s identically (the read layer collapsed that distinction, so there is one
 * branch: `null → notFound()`). Every post kind renders through this template.
 *
 * Static-first: `generateStaticParams` prebuilds the known published slugs; `dynamicParams` renders a
 * slug published after the last build on first request, then ISR-caches it (SC-007). The slug reads
 * are resilient, so the build succeeds even when the DB is unreachable (prerenders no slugs).
 *
 * Not-found semantics: an unknown/draft/future slug renders this feature's not-found page (the SC-004
 * user-facing dead-end — a draft is never *readable*, and drafts are excluded from the sitemap, index,
 * and feed). Because the route is ISR-prerendered (the SC-007 requirement above), Next serves that
 * not-found render with a soft-404 (200) rather than a hard 404; forcing a hard 404 would mean opting
 * the route out of static generation, trading away the static-first model. We keep static-first: the
 * guarantee that matters — drafts are unreachable and undiscoverable — holds either way.
 */
export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs = await getPublishedSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) return {}; // the page itself 404s; nothing to describe.
  const view = toPostView(post);
  return {
    title: post.title,
    description: view.excerpt,
    alternates: { canonical: `/news/${slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: view.excerpt,
      url: `/news/${slug}`,
      images: [view.ogImage],
      publishedTime: view.publishedAt.toISOString(),
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  const view = toPostView(post);

  return (
    <article className="px-safe mx-auto max-w-shell py-12 sm:py-16">
      <ArticleHeader post={view} />
      <ArticleBody post={view} />
    </article>
  );
}
