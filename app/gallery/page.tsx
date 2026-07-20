import type { Metadata } from "next";

/**
 * Dev-only design-system gallery — the isolation/review + e2e-test surface for Feature 3
 * (Storybook deferred, research D1). Sections fill in per user story: token reference (US1),
 * primitives (US3), brand/faction demo (US4). Reachable at `/gallery`, kept out of search.
 *
 * (Routed at `/gallery`, not `/_gallery` — an underscore-prefixed folder is a Next.js *private
 * folder* and is opted out of routing, so it could never serve a page.)
 */
export const metadata: Metadata = {
  title: "Design System — Warform Commander",
  robots: { index: false, follow: false },
};

export default function GalleryPage() {
  return (
    <main id="gallery" className="mx-auto max-w-(--container-shell) px-6 py-10">
      <h1 className="font-display text-h1 text-text-strong">Warform Commander — Design System</h1>
      <p className="mt-2 text-text-muted">
        Dev reference for tokens, primitives, and brand. Sections fill in per user story.
      </p>
      {/* US1: token reference · US3: primitives · US4: brand + faction/zone theming */}
    </main>
  );
}
