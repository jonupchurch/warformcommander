import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";

/** The v1 / backlog split (§16.1). */
const IN_V1 = [
  "Deterministic Bo3 battle engine",
  "The Garage — squad builder + doctrine editor",
  "Async PvP Arena + no-stakes Practice",
  "Net-victory Ladder + commander Profiles",
  "Monte-Carlo auto-balancer",
];

const LATER = [
  "Live balance publishing + admin console",
  "Ranked seasons + tiers",
  "Expanded roster variants & equipment",
  "Community tournaments",
  "Dynamic per-article social cards",
];

/** The Home roadmap snapshot (T016, FR-003) — the "In v1 / Later" split. `id="roadmap"` scroll target. */
export function RoadmapSnapshot() {
  return (
    <section id="roadmap" className="px-safe mx-auto max-w-shell scroll-mt-16 py-16 sm:py-24">
      <SectionLabel index="03">Roadmap</SectionLabel>
      <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel eyebrow="In v1" className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {IN_V1.map((item) => (
              <li key={item} className="type-body flex items-start gap-3 text-text">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-faction-friendly" />
                {item}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel eyebrow="Later" inset="sunken" className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {LATER.map((item) => (
              <li key={item} className="type-body flex items-start gap-3 text-text-muted">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-border-strong" />
                {item}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </section>
  );
}
