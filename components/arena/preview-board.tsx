/**
 * `PreviewBoard` (Feature 8, US1/US3) — the fogged enemy projection both the Arena and Practice
 * panels render. It shows ONLY what the server chose to reveal — composition (type + variant +
 * zone), power, and derived damage-family tags — because its only input is a {@link MatchTicketPreview},
 * which structurally has no behavior-dial / Plan-B field (FR-007). There is nothing hidden to leak
 * here: the blind guarantee is upstream in `fogPreview`, so this is a pure token-only renderer.
 */

import { UnitIcon, type MachineTypeKey } from '@/components/brand/unit-icon';
import { Chip, type ChipProps } from '@/components/ui/chip';
import type { MatchTicketPreview, PreviewMachine } from '@/server/arena-types';
import { cn } from '@/lib/utils';

/** Engine `MachineTypeId` → the Feature 3 `UnitIcon` key (the closed 7-type set). */
const ICON_KEY: Record<string, MachineTypeKey> = {
  HeavyTank: 'heavytank',
  LightTank: 'lighttank',
  Mech: 'mech',
  AttackHeli: 'heli',
  RocketArtillery: 'rocketarty',
  Artillery: 'artillery',
  RearSupport: 'support',
};

const MACHINE_LABEL: Record<MachineTypeKey, string> = {
  heavytank: 'Heavy Tank',
  lighttank: 'Light Tank',
  mech: 'Mech',
  heli: 'Attack Heli',
  rocketarty: 'Rocket Artillery',
  artillery: 'Artillery',
  support: 'Rear Support',
};

/** The four battlefield rows, top-to-bottom, matching the Arena mockup's enemy board. */
const ZONE_ORDER = ['Air', 'Front', 'Middle', 'Rear'] as const;
const ZONE_TONE: Record<string, ChipProps['tone']> = {
  Air: 'air',
  Front: 'front',
  Middle: 'middle',
  Rear: 'rear',
};

/** Damage-family tag → chip tone (falls back to neutral for an unknown family). */
const FAMILY_TONE: Record<string, ChipProps['tone']> = {
  Kinetic: 'kinetic',
  Energy: 'energy',
  Explosive: 'explosive',
  Support: 'support',
};

function EnemyMachine({ machine }: { machine: PreviewMachine }) {
  const key = ICON_KEY[machine.typeId] ?? 'heavytank';
  const label = MACHINE_LABEL[key];
  return (
    <div className="flex items-center gap-2 rounded-md border border-faction-enemy/25 bg-faction-enemy-soft px-2 py-1.5">
      <span className="flex size-7 shrink-0 items-center justify-center text-faction-enemy">
        <UnitIcon type={key} faction="enemy" title={`${label} ${machine.variantId}`} className="h-full w-full" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="type-readout truncate text-xs text-text-strong">{machine.variantId}</span>
        <span className="type-eyebrow text-[0.5rem] text-text-muted">{label}</span>
      </div>
    </div>
  );
}

export interface PreviewBoardProps {
  preview: MatchTicketPreview;
  className?: string;
}

export function PreviewBoard({ preview, className }: PreviewBoardProps) {
  const byZone = ZONE_ORDER.map((zone) => ({
    zone,
    machines: preview.composition.filter((m) => m.zone === zone),
  })).filter((z) => z.machines.length > 0);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="type-eyebrow text-text-muted">ENEMY DEFENSE</span>
        <span className="type-readout text-sm tabular-nums text-faction-enemy">
          PWR {preview.power.toLocaleString()}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {byZone.map(({ zone, machines }) => (
          <div key={zone} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Chip tone={ZONE_TONE[zone] ?? 'neutral'} className="text-[0.5rem]">
                {zone.toUpperCase()}
              </Chip>
              <span className="type-eyebrow text-[0.5rem] text-text-muted">
                {machines.length} {machines.length === 1 ? 'MACHINE' : 'MACHINES'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {machines.map((m, i) => (
                <EnemyMachine key={`${zone}-${m.variantId}-${i}`} machine={m} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {preview.damageFamilyTags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="type-eyebrow text-[0.5rem] text-text-muted">THREAT PROFILE</span>
          <div className="flex flex-wrap gap-1.5">
            {preview.damageFamilyTags.map((family) => (
              <Chip key={family} tone={FAMILY_TONE[family] ?? 'neutral'}>
                {family}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
