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

export type BoardSide = 'friendly' | 'enemy';

/** Per-side presentation: the default eyebrow, the accent (power + icon tint), and the card skin. */
const SIDE: Record<BoardSide, { eyebrow: string; accent: string; card: string; icon: 'friendly' | 'enemy'; tags: string }> = {
  friendly: {
    eyebrow: 'YOUR ATTACK',
    accent: 'text-faction-friendly',
    card: 'border-faction-friendly/25 bg-faction-friendly-soft',
    icon: 'friendly',
    tags: 'YOUR PROFILE',
  },
  enemy: {
    eyebrow: 'ENEMY DEFENSE',
    accent: 'text-faction-enemy',
    card: 'border-faction-enemy/25 bg-faction-enemy-soft',
    icon: 'enemy',
    tags: 'THREAT PROFILE',
  },
};

function Machine({ machine, side }: { machine: PreviewMachine; side: BoardSide }) {
  const skin = SIDE[side];
  const key = ICON_KEY[machine.typeId] ?? 'heavytank';
  const label = MACHINE_LABEL[key];
  return (
    <div className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5', skin.card)}>
      <span className={cn('flex size-7 shrink-0 items-center justify-center', skin.accent)}>
        <UnitIcon type={key} faction={skin.icon} title={`${label} ${machine.variantId}`} className="h-full w-full" />
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
  /** Whose board this is — drives the accent, card skin, and default eyebrow. Defaults to `enemy`. */
  side?: BoardSide;
  /** Override the default eyebrow (e.g. to fold "SERVED BLIND" into the enemy header). */
  eyebrow?: string;
  /** Sub-heading under the eyebrow — the opponent handle (enemy) or the squad name (friendly).
   *  Omitted for anonymous Practice draws (FR-014). */
  label?: string;
  /** Stack machines in a single column (the compact side-by-side Arena layout); default two-up. */
  stacked?: boolean;
  className?: string;
}

export function PreviewBoard({ preview, side = 'enemy', eyebrow, label, stacked = false, className }: PreviewBoardProps) {
  const skin = SIDE[side];
  const byZone = ZONE_ORDER.map((zone) => ({
    zone,
    machines: preview.composition.filter((m) => m.zone === zone),
  })).filter((z) => z.machines.length > 0);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="type-eyebrow text-text-muted">{eyebrow ?? skin.eyebrow}</span>
          {label && (
            <span className="type-h3 truncate text-text-strong" title={label}>
              {label}
            </span>
          )}
        </div>
        <span className={cn('type-readout text-sm tabular-nums', skin.accent)}>
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
            <div className={cn('grid gap-1.5', stacked ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
              {machines.map((m, i) => (
                <Machine key={`${zone}-${m.variantId}-${i}`} machine={m} side={side} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {preview.damageFamilyTags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="type-eyebrow text-[0.5rem] text-text-muted">{skin.tags}</span>
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
