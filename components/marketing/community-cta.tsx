import Link from "next/link";

import { Button } from "@/components/ui/button";
import { GridBackdrop } from "@/components/ui/grid-backdrop";
import { SectionLabel } from "@/components/ui/section-label";

/**
 * The Home community CTA section (T018, FR-002): Wishlist / How to Play / Join-the-community as
 * accessible, keyboard-operable `Button` primitives. `id="community"` is the nav's Community target.
 */
export function CommunityCta() {
  return (
    <section id="community" className="scroll-mt-16 border-t border-border">
      <GridBackdrop glow="cyan" scanlines={false} className="px-safe mx-auto max-w-shell py-20 sm:py-28">
        <SectionLabel index="04">Enlist</SectionLabel>
        <h2 className="type-h1 mt-8 max-w-3xl text-balance text-text-strong">
          Ready to command? Plan your first squad.
        </h2>
        <p className="type-body-lg mt-6 max-w-prose text-text-muted">
          Wishlist to get the launch dispatch, learn the counter-web, and join the commanders shaping
          the meta — where the only edge is a better plan.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Button asChild size="lg">
            <Link href="/#community">Wishlist</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/#overview">How to Play</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/news">Join the community</Link>
          </Button>
        </div>
      </GridBackdrop>
    </section>
  );
}
