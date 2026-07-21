import Link from "next/link";

import { Button } from "@/components/ui/button";
import { GridBackdrop } from "@/components/ui/grid-backdrop";
import { PLAY_CTA, WISHLIST_CTA } from "@/lib/marketing-nav";

/**
 * The Home hero (T014, FR-001/FR-002): the one-line pitch, the **exact** non-P2W brand promise
 * "Skill lives in the plan — never the wallet." (constitution P1, SC-008), and the primary CTAs.
 * `id="overview"` is the nav's Overview scroll target.
 */
export function Hero() {
  return (
    <GridBackdrop
      glow="split"
      id="overview"
      className="scroll-mt-16 border-b border-border"
    >
      <div className="px-safe mx-auto max-w-shell py-20 sm:py-28 lg:py-36">
        <p className="type-eyebrow text-faction-friendly">
          Non-pay-to-win · deterministic · plan &gt; twitch
        </p>
        <h1 className="type-display mt-6 max-w-4xl text-balance text-4xl text-text-strong sm:text-6xl lg:text-7xl">
          Command warforms. Win on the plan.
        </h1>
        <p className="type-body-lg mt-6 max-w-prose text-text-muted">
          A sci-fi tactics auto-battler. Configure your squads, set their doctrine, and let seeded,
          deterministic battles decide the ladder. No reflexes. No paywall — every advantage is a
          decision anyone can make.
        </p>
        <p className="type-h2 mt-10 max-w-3xl text-balance text-text-strong">
          Skill lives in the plan — never the wallet.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Button asChild size="lg">
            <Link href={PLAY_CTA.href}>Play now</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/#overview">How to Play</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href={WISHLIST_CTA.href}>{WISHLIST_CTA.label}</Link>
          </Button>
        </div>
      </div>
    </GridBackdrop>
  );
}
