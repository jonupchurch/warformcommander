import Link from "next/link";

import { PrimaryNav } from "./primary-nav";
import { IdentityBadge, type IdentityBadgeProps } from "./identity-badge";

export interface AppShellProps {
  children: React.ReactNode;
  /** commander/rank/avatar; omit on unauthenticated. */
  identity?: IdentityBadgeProps;
}

/**
 * The chrome every authenticated screen renders inside (implemented as the `app/(app)` layout):
 * sticky blurred header (Logo + Wordmark + IdentityBadge) + responsive PrimaryNav + a
 * max-width-constrained, safe-area-padded content region. Guarantees a skip link + nav landmark
 * (FR-011), `min-h-dvh`, and **no horizontal overflow 320px→∞** (SC-001).
 */
export function AppShell({ children, identity }: AppShellProps) {
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
          <div className="flex min-w-0 items-center gap-6">
            <Link
              href="/"
              aria-label="Warform Commander home"
              className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <LogoPlaceholder />
              <span className="font-display text-h3 font-black tracking-tightest text-text-strong font-stretch-125%">
                WARFORM
              </span>
            </Link>
            <PrimaryNav />
          </div>
          {identity ? (
            <IdentityBadge {...identity} />
          ) : (
            <span className="type-label text-text-muted">Guest</span>
          )}
        </div>
      </header>

      {/* pb clears the fixed bottom nav on portrait; released at lg where the top tabs take over. */}
      <main
        id="main-content"
        className="px-safe mx-auto w-full max-w-shell flex-1 pb-24 pt-6 lg:pb-8"
      >
        {children}
      </main>
    </div>
  );
}

/** Two-wedge mark placeholder — replaced by the real <Logo> in US4 (T044). */
function LogoPlaceholder() {
  return (
    <span aria-hidden className="flex items-center gap-0.5">
      <span className="h-4 w-2 -skew-x-12 bg-faction-friendly" />
      <span className="h-4 w-2 -skew-x-12 bg-faction-enemy-brand" />
    </span>
  );
}
