import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Wordmark } from "@/components/brand/wordmark";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

/**
 * The chrome every **public** marketing page renders inside (the `app/(marketing)` layout) — the
 * counterpart to the authenticated `AppShell`. A sticky blurred header (Logo + Wordmark +
 * `MarketingNav` + Wishlist CTA) and a `MarketingFooter`, first-class in both portrait and landscape
 * (FR-004/FR-006, P7). No `IdentityBadge` — the marketing site is entirely unauthenticated.
 * `min-h-dvh` + `max-w-shell` + `px-safe` guarantee no horizontal overflow at any width (SC-005).
 */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="type-label sr-only rounded-md bg-faction-friendly px-4 py-2 text-void focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-surface-chrome [backdrop-filter:blur(var(--blur-chrome))]">
        <div className="px-safe mx-auto flex h-16 max-w-shell items-center justify-between gap-4">
          <Link
            href="/"
            aria-label="Warform Commander home"
            className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Logo />
            <Wordmark size="sm" />
          </Link>
          <MarketingNav />
        </div>
      </header>

      {/* pt clears the portrait nav row that pins just below the header; released at md. */}
      <main id="main-content" className="flex-1 pt-12 md:pt-0">
        {children}
      </main>

      <MarketingFooter />
    </div>
  );
}
