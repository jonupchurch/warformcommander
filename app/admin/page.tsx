import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";

/**
 * Admin landing (Feature 12) — the console overview. Non-P2W by construction: the only surfaces are
 * balance editing + the auto-published news it drives. No store, no price, no per-account grant (P1).
 */
export const metadata: Metadata = { title: "Overview" };

export default function AdminHome() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionLabel index="00">Live-ops</SectionLabel>
        <h1 className="type-display mt-4 text-3xl text-text-strong sm:text-4xl">Admin console</h1>
        <p className="mt-4 max-w-prose type-body text-text-muted">
          Tune the shared balance table and keep the public news feed honest. The only lever here is the
          ruleset — no store, no price, no power grant.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Panel eyebrow="Moderation">
          <h2 className="type-h3 text-text-strong">User management</h2>
          <p className="mt-2 type-body-sm text-text-muted">
            Search commanders, review their record, and ban or delete accounts. Deleting keeps every
            opponent&rsquo;s match history intact — no one else&rsquo;s stats change.
          </p>
          <div className="mt-4">
            <Button asChild size="sm">
              <Link href="/admin/users">Open moderation</Link>
            </Button>
          </div>
        </Panel>

        <Panel eyebrow="Balance">
          <h2 className="type-h3 text-text-strong">Live balance editor</h2>
          <p className="mt-2 type-body-sm text-text-muted">
            Edit base stats; each save takes effect for the next match and auto-publishes a balance
            dispatch with the diff.
          </p>
          <div className="mt-4">
            <Button asChild size="sm">
              <Link href="/admin/balance">Open editor</Link>
            </Button>
          </div>
        </Panel>

        <Panel eyebrow="Dispatches" inset="sunken">
          <h2 className="type-h3 text-text-strong">Auto-published news</h2>
          <p className="mt-2 type-body-sm text-text-muted">
            Balance edits and code pushes post to the public News feed automatically — no manual
            authoring, exactly one post per change or commit.
          </p>
          <div className="mt-4">
            <Button asChild variant="secondary" size="sm">
              <Link href="/news">View news</Link>
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
