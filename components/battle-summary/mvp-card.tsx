/**
 * `MvpCard` (Feature 6, T019) — the optional Match MVP (`vm.mvp`): the top damage dealer's `UnitIcon`,
 * name/variant, and its damage dealt / kills / damage absorbed. **Renders nothing** when `vm.mvp` is
 * absent (no per-machine damage available — FR-010). Pure render; token-only.
 */

import { UnitIcon } from '@/components/brand/unit-icon';
import type { BattleSummaryViewModel } from '@/lib/battle-summary/view-model';
import { cn } from '@/lib/utils';
import { MACHINE_LABEL } from './machine-name';

export interface MvpCardProps {
  mvp: BattleSummaryViewModel['mvp'];
  className?: string;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="type-readout text-xs text-text-muted">{label}</span>
      <span className="type-readout text-xs font-bold text-text-strong tabular-nums">{value}</span>
    </div>
  );
}

export function MvpCard({ mvp, className }: MvpCardProps) {
  if (!mvp) return null;
  const label = MACHINE_LABEL[mvp.typeKey];
  const faction = mvp.side === 'viewer' ? 'friendly' : 'enemy';

  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-family-explosive/30 bg-surface-rail p-5 sm:p-6',
        className,
      )}
      aria-label={`Match MVP: ${label} ${mvp.variant}`}
    >
      <span className="type-eyebrow text-family-explosive">★ MATCH MVP</span>
      <div
        className={cn(
          'flex h-20 items-center justify-center rounded-lg border p-2.5',
          faction === 'friendly'
            ? 'border-faction-friendly/25 bg-faction-friendly-soft'
            : 'border-faction-enemy/25 bg-faction-enemy-soft',
        )}
      >
        <UnitIcon type={mvp.typeKey} faction={faction} title={`${label} ${mvp.variant}`} className="h-full" />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="type-h3 font-bold text-text-strong">{label}</span>
        <span className={cn('type-readout text-xs', faction === 'friendly' ? 'text-faction-friendly' : 'text-faction-enemy')}>
          {mvp.variant}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <Stat label="DAMAGE DEALT" value={mvp.damageDealt.toLocaleString()} />
        <Stat label="KILLS" value={String(mvp.kills)} />
        <Stat label="DMG ABSORBED" value={mvp.damageAbsorbed.toLocaleString()} />
      </div>
    </section>
  );
}
