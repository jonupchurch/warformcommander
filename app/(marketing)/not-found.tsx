import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * The marketing 404 (T046, FR-013) — rendered for an unknown route under `(marketing)` and for an
 * unknown/draft/future article slug (the `notFound()` call in `[slug]/page.tsx`). A draft is never
 * distinguishable from "doesn't exist", so this is the single not-found surface.
 */
export default function MarketingNotFound() {
  return (
    <div className="px-safe mx-auto flex min-h-[60vh] max-w-shell flex-col items-center justify-center gap-6 text-center">
      <p className="type-eyebrow text-faction-friendly">404 // signal lost</p>
      <h1 className="type-h1 text-text-strong">Dispatch not found</h1>
      <p className="type-body max-w-prose text-text-muted">
        That page or article doesn&apos;t exist — it may have moved, or never been published.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <Button asChild size="lg">
          <Link href="/news">Back to the news</Link>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
