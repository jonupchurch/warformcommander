/**
 * `SignatureSquads` (Feature 10, T023 — US3) — the subject's most-played squads: name + games + a
 * win-rate `StatBar`. A since-deleted squad shows the `[deleted squad]` placeholder (FR-015). Renders
 * nothing when the subject has played no squads. Token-only.
 */

import { StatBar } from '@/components/ui/stat-bar';
import type { SignatureSquad } from '@/lib/profile-types';

export function SignatureSquads({ squads }: { squads: SignatureSquad[] }) {
  if (squads.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-eyebrow text-text-muted">SIGNATURE SQUADS</h2>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-rail p-4">
        {squads.map((s, i) => (
          <div key={`${s.name}-${i}`} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="type-readout truncate text-sm text-text-strong">{s.name}</span>
              <span className="type-eyebrow text-text-muted">{s.games} GAMES</span>
            </div>
            <StatBar label="WIN RATE" value={s.winRatePct} max={100} display={`${s.winRatePct}%`} />
          </div>
        ))}
      </div>
    </section>
  );
}
