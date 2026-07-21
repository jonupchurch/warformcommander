import type { Metadata } from "next";
import Link from "next/link";

import { Panel } from "@/components/ui/panel";

/**
 * Account-suspended notice — where the `(app)` layout bounces a banned commander. Standalone (outside
 * the `(app)` group) so the redirect can't loop. Purely informational; the actual block is server-side
 * (`requireSession` rejects every authed action for a banned account).
 */
export const metadata: Metadata = { title: "Account suspended", robots: { index: false, follow: false } };

export default function BannedPage() {
  return (
    <main className="px-safe mx-auto flex min-h-dvh max-w-shell items-center justify-center py-16">
      <Panel inset="sunken" className="flex max-w-prose flex-col items-start gap-4">
        <span className="type-eyebrow text-faction-enemy">Account suspended</span>
        <h1 className="type-h2 text-text-strong">Your commander account is suspended</h1>
        <p className="type-body text-text-muted">
          An operator has suspended this account, so it can&rsquo;t enter the Garage, Arena, or ladder.
          If you believe this is a mistake, reach out through the community channels.
        </p>
        <Link
          href="/"
          className="type-label rounded-md border border-border px-4 py-2 text-text-strong transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          ← Back to site
        </Link>
      </Panel>
    </main>
  );
}
