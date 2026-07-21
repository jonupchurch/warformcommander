/**
 * `CareerStatsGrid` (Feature 10, T013 — US1) — the full career readout as `Stat` tiles: record,
 * defenses held, total damage (compact), current/best streak, matches. Responsive 4→2 cols with no
 * 360px overflow. Every value comes straight from `CareerStats` (SC-001).
 */

import { Stat } from '@/components/ui/stat';
import { compact } from '@/lib/format-compact';
import type { CareerStats } from '@/lib/profile-types';

export function CareerStatsGrid({ career }: { career: CareerStats }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-eyebrow text-text-muted">CAREER</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="RECORD" value={career.record} />
        <Stat label="DEFENSES HELD" value={career.defenseWins.toLocaleString()} />
        <Stat label="TOTAL DAMAGE" value={compact(career.totalDamage)} />
        <Stat label="CURRENT STREAK" value={career.currentStreak.toLocaleString()} />
        <Stat label="ATTACK W/L" value={`${career.attackWins}/${career.attackLosses}`} />
        <Stat label="DEFENSE W/L" value={`${career.defenseWins}/${career.defenseLosses}`} />
      </div>
    </section>
  );
}
