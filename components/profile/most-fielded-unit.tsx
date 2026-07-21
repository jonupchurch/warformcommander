/**
 * `MostFieldedUnit` (Feature 10, T024 — US3) — the machine the subject fields most across their
 * squads, as a `UnitIcon` + label (+ optional pick share). Returns `null` to omit the section entirely
 * when the subject has no squads (FR-016). Token-only.
 */

import { UnitIcon } from '@/components/brand/unit-icon';
import { Panel } from '@/components/ui/panel';
import type { MostFieldedUnit as MostFieldedUnitData } from '@/lib/profile-types';

export function MostFieldedUnit({ unit }: { unit: MostFieldedUnitData | null }) {
  if (!unit) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-eyebrow text-text-muted">MOST FIELDED</h2>
      <Panel inset="rail" className="flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-lg border border-faction-friendly/30 bg-faction-friendly-soft p-2 text-faction-friendly">
          <UnitIcon type={unit.type} faction="friendly" title={unit.label} className="size-full" />
        </span>
        <div className="flex flex-col">
          <span className="type-readout text-base text-text-strong">{unit.label}</span>
          {unit.pickPct != null && (
            <span className="type-eyebrow text-text-muted">{unit.pickPct}% OF FIELDED MACHINES</span>
          )}
        </div>
      </Panel>
    </section>
  );
}
