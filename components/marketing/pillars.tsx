import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";

/** The four design pillars (§2) — the first is the explicit non-P2W pillar (constitution P1). */
const PILLARS: { index: string; title: string; body: string }[] = [
  {
    index: "01",
    title: "Non-pay-to-win by construction",
    body: "Every unit, variant, and upgrade is earnable and side-grade — trade-offs, never strict power. The economy can't sell an advantage, because none exists to sell.",
  },
  {
    index: "02",
    title: "Planning over twitch",
    body: "You never pilot a unit. You compose the squad, set its doctrine and Plan-B triggers, and the battle resolves itself. Wins are earned before the first shot.",
  },
  {
    index: "03",
    title: "Depth from configuration",
    body: "A compact roster hides a vast space — type × variant × loadout × dials × positioning — so mastery is knowing the counters, not grinding a bigger number.",
  },
  {
    index: "04",
    title: "Fairness is verified, not hoped",
    body: "A Monte-Carlo balancer runs the same engine thousands of times to flag any dominant or degenerate combo before players find it. Balance is a measured number.",
  },
];

/** The Home pillars section (T015, FR-001) — one pillar explicitly communicates non-P2W (P1). */
export function Pillars() {
  return (
    <section className="px-safe mx-auto max-w-shell py-16 sm:py-24">
      <SectionLabel index="02">Why it&apos;s different</SectionLabel>
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
        {PILLARS.map((p) => (
          <Panel key={p.index} className="flex flex-col gap-3">
            <span className="type-readout text-faction-friendly">{p.index}</span>
            <h3 className="type-h3 text-text-strong">{p.title}</h3>
            <p className="type-body text-text-muted">{p.body}</p>
          </Panel>
        ))}
      </div>
    </section>
  );
}
