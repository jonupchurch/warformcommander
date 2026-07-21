/**
 * The read-only fairness-report panel (Feature 12, US5/T043). Renders Feature 2's latest committed
 * BalanceReport — the four invariants (measured + margin + pass/fail), the severity-sorted flagged
 * combos (with reasons), and the matchup win-rate table — so tuning is evidence-driven. A clear empty
 * state when no report is committed; editing stays available (the report is advisory, not a gate).
 * Tables scroll within their own container, never the page body (P7).
 */

import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";
import type { BalanceReport } from "@/server/balance-report";

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

const FLAG_TONE: Record<string, "enemy" | "energy" | "neutral"> = {
  Dominant: "enemy",
  Degenerate: "enemy",
  Underpowered: "energy",
};

export function BalanceReportPanel({ report }: { report: BalanceReport | null }) {
  if (!report) {
    return (
      <Panel inset="sunken" eyebrow="Fairness report">
        <h3 className="type-h3 text-text-strong">No balance report yet</h3>
        <p className="mt-3 type-body-sm max-w-prose text-text-muted">
          Run the Monte-Carlo balancer (<span className="type-readout">crates/balancer</span>) and commit
          its output under <span className="type-readout">balance-reports/</span> to see proven imbalance
          here. The report is advisory — editing is available regardless.
        </p>
      </Panel>
    );
  }

  const failing = report.invariants.filter((i) => !i.pass).length;

  return (
    <Panel inset="sunken" eyebrow="Fairness report">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="type-h3 text-text-strong">Balance report</h3>
        <span className="type-readout text-text-muted">
          ruleset {report.provenance.rulesetHash.slice(0, 12)} · {report.coverage.totalResolutions.toLocaleString()} resolutions
        </span>
      </div>

      {/* Invariants */}
      <div className="mt-6">
        <SectionLabel index="I">Invariants{failing > 0 ? ` — ${failing} failing` : ""}</SectionLabel>
        <ul className="mt-4 flex flex-col gap-2">
          {report.invariants.map((inv) => (
            <li
              key={inv.name}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-hairline bg-surface-raised px-3 py-2"
            >
              <span className="type-label text-text-strong">{inv.name}</span>
              <span className="flex items-center gap-3">
                <span className="type-readout tabular-nums text-text-muted">
                  measured {inv.measured.toFixed(3)} · margin {inv.margin.toFixed(3)}
                </span>
                <Chip tone={inv.pass ? "friendly" : "enemy"}>{inv.pass ? "PASS" : "FAIL"}</Chip>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Flagged combos (worst-first) */}
      <div className="mt-6">
        <SectionLabel index="F">Flagged{report.flagged.length === 0 ? " — none" : ""}</SectionLabel>
        {report.flagged.length === 0 ? (
          <p className="mt-3 type-body-sm text-text-muted">No dominant, degenerate, or underpowered combos surfaced.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {report.flagged.map((f, i) => (
              <li key={`${f.combo.label}-${i}`} className="rounded-md border border-border-hairline bg-surface-raised px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="type-label text-text-strong">{f.combo.label}</span>
                  <span className="flex items-center gap-2">
                    <Chip tone={FLAG_TONE[f.kind] ?? "neutral"}>{f.kind}</Chip>
                    <span className="type-readout tabular-nums text-text-muted">{pct(f.acrossFieldWinRate)}</span>
                  </span>
                </div>
                <p className="mt-1 type-body-sm text-text-muted">{f.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Matchups */}
      <div className="mt-6">
        <SectionLabel index="M">Matchups</SectionLabel>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-md border-collapse text-left">
            <thead>
              <tr className="type-eyebrow text-text-dim">
                <th className="pb-2 pr-4 font-normal">Matchup</th>
                <th className="pb-2 pr-4 font-normal">Win rate (A)</th>
                <th className="pb-2 font-normal">95% CI</th>
              </tr>
            </thead>
            <tbody>
              {report.matchups.map((m, i) => (
                <tr key={`${m.label}-${i}`} className="border-t border-border-hairline">
                  <td className="py-2 pr-4 type-body-sm text-text">{m.label}</td>
                  <td className="py-2 pr-4 type-readout tabular-nums text-text-strong">{pct(m.winRateA)}</td>
                  <td className="py-2 type-readout tabular-nums text-text-muted">
                    {pct(m.ci95.low)} – {pct(m.ci95.high)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}
