import type { Metadata } from "next";

import { Hero } from "@/components/marketing/hero";
import { Pillars } from "@/components/marketing/pillars";
import { RoadmapSnapshot } from "@/components/marketing/roadmap-snapshot";
import { NewsTeaser } from "@/components/marketing/news-teaser";
import { CommunityCta } from "@/components/marketing/community-cta";
import { getLatestPosts } from "@/server/news";
import { markFeatured, toPostSummary } from "@/lib/post-view";

/**
 * Home / landing "/" (US1) — the public front door. Communicates the pitch, the four pillars (incl.
 * the non-P2W promise, P1), the roadmap snapshot, a latest-news teaser, and the CTAs. A complete,
 * demonstrable marketing site even with zero posts. Replaces the Feature 3 placeholder `app/page.tsx`.
 *
 * Static-first with a time-based revalidation backstop; the teaser read is resilient (empty when the
 * DB is unreachable at build), and on-demand revalidation (the F11↔F12 seam) refreshes it on publish.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  description:
    "Warform Commander — a non-pay-to-win, planning-over-twitch sci-fi tactics auto-battler. Configure your squads, set their doctrine, and let deterministic battles decide the ladder.",
  openGraph: {
    title: "Warform Commander",
    description: "Skill lives in the plan — never the wallet. A non-pay-to-win sci-fi tactics auto-battler.",
    images: ["/og-default.png"],
  },
};

export default async function HomePage() {
  const latest = await getLatestPosts(3);
  const teaser = markFeatured(latest.map(toPostSummary), latest);

  return (
    <>
      <Hero />
      <Pillars />
      <RoadmapSnapshot />
      <NewsTeaser posts={teaser} />
      <CommunityCta />
    </>
  );
}
