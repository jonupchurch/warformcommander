'use client';

/**
 * The Garage screen (T011) — the two co-equal layouts as one DOM: a 3-column landscape rig
 * (rail 288 / formation 1fr / detail 372, per the mockup) that **stacks** below `lg` for portrait
 * (P7 — switch on width, not orientation, reusing Feature 3's law). Each region reads the shared
 * editor context, so there is no prop drilling.
 */

import { DefensePanel } from './defense-panel';
import { FormationBoard } from './formation-board';
import { SquadRail } from './squad-rail';
import { UnitDetailPanel } from './unit-detail-panel';
import { UnsavedGuard } from './unsaved-guard';

export function GarageScreen() {
  return (
    <div className="flex flex-col gap-4">
      <UnsavedGuard />
      <div className="grid gap-4 lg:grid-cols-[288px_1fr_372px] lg:items-start">
        <SquadRail />
        <FormationBoard />
        <UnitDetailPanel />
      </div>
      <DefensePanel />
    </div>
  );
}
