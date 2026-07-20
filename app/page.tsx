import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Placeholder home. The real marketing Home (with its own marketing shell) is Feature 11; here it's
 * a minimal landing that links into the authenticated app shell built in this feature (US2, T027).
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-shell flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="type-display text-text-strong">WARFORM</h1>
      <p className="type-body-lg max-w-prose text-text-muted">
        Non-pay-to-win configurable auto-battler. Build your squads, set their doctrine, let
        deterministic battles decide the ladder.
      </p>
      <Button asChild size="lg">
        <Link href="/garage">Enter the Garage</Link>
      </Button>
    </main>
  );
}
