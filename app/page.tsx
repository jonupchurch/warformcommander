/**
 * Placeholder home. The real marketing Home is Feature 11; the authenticated app-shell demo
 * lands in this feature (US2, T027). This minimal stub replaces the Next.js scaffold page so the
 * token guard (SC-002) stays green from Phase 1 on.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-(--container-shell) flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-h1 text-text-strong">WARFORM COMMANDER</h1>
      <p className="text-text-muted">Non-pay-to-win configurable auto-battler.</p>
    </main>
  );
}
