import Link from "next/link";

/**
 * Placeholder home. The real marketing Home (with its own marketing shell) is Feature 11; here it's
 * a minimal landing that links into the authenticated app shell built in this feature (US2, T027).
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-(--container-shell) flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="type-display text-text-strong">WARFORM</h1>
      <p className="type-body-lg max-w-prose text-text-muted">
        Non-pay-to-win configurable auto-battler. Build your squads, set their doctrine, let
        deterministic battles decide the ladder.
      </p>
      <Link
        href="/garage"
        className="type-label rounded-md bg-faction-friendly px-6 py-3 text-void shadow-glow-cyan transition-colors motion-safe:duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Enter the Garage
      </Link>
    </main>
  );
}
