import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Wordmark } from "@/components/brand/wordmark";

import { PrimaryNav } from "./primary-nav";
import { IdentityMenu, type IdentityMenuProps } from "./identity-menu";

export interface AppShellProps {
  children: React.ReactNode;
  /** commander/rank/avatar; omit on unauthenticated (the menu then offers Log In). */
  identity?: IdentityMenuProps["identity"];
}

/**
 * The chrome every authenticated screen renders inside (implemented as the `app/(app)` layout):
 * sticky blurred header (Logo + Wordmark + IdentityMenu) + responsive PrimaryNav + a
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
              <Logo />
              <Wordmark size="sm" />
            </Link>
            <PrimaryNav />
          </div>
          <IdentityMenu identity={identity} />
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
