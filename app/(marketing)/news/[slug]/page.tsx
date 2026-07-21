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
