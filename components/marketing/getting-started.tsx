import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";

/**
 * Getting-started section (Home) — a short walkthrough video for new commanders, served straight from
 * `public/Tutorial.mp4`. Native `<video controls>` (no autoplay; `preload="metadata"` so the ~27 MB
 * file isn't fetched until played), so this stays a Server Component with no client JS.
 */
export function GettingStarted() {
  return (
    <section id="getting-started" className="px-safe mx-auto max-w-shell scroll-mt-16 py-16 sm:py-24">
      <SectionLabel index="01">Getting started</SectionLabel>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-center">
        <div className="flex flex-col gap-4">
          <h2 className="type-h2 text-text-strong">Learn the ropes in a few minutes</h2>
          <p className="type-body text-text-muted">
            New here? This walkthrough runs the whole loop — build a squad in the Garage, set each
            machine&apos;s loadout and doctrine, designate a defense, then send an attack in the Arena
            and watch the deterministic battle resolve. No twitch, all planning.
          </p>
          <p className="type-body-sm text-text-muted">Best watched with sound on.</p>
        </div>
        <Panel className="overflow-hidden p-0">
          <video
            controls
            preload="metadata"
            playsInline
            aria-label="Warform Commander getting-started walkthrough"
            className="aspect-video w-full bg-void"
          >
            <source src="/Tutorial.mp4" type="video/mp4" />
            Your browser can&apos;t play embedded video —{" "}
            <a href="/Tutorial.mp4" className="text-faction-friendly underline">
              download the walkthrough
            </a>
            .
          </video>
        </Panel>
      </div>
    </section>
  );
}
