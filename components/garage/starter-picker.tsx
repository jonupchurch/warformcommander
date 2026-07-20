'use client';

/**
 * The on-ramp starter picker (T032, US4) — a `+ PRESET` menu on the formation header that fields a
 * coherent machine from a **stock build** in one tap, **without opening the deep editor** (SC-004,
 * AS1). Stock builds are grouped by machine type (each type's variants); picking one applies it into
 * the first empty slot via `applyStock` (which fields the slot + drops it into the type's home zone)
 * and selects it. Complements `+ ADD UNIT` (which seeds the type's default build) with variant choice.
 */

import { UnitIcon } from '@/components/brand/unit-icon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MACHINE_TYPES, MACHINE_TYPE_LABEL, UNIT_ICON_KEY } from '@/lib/garage/display';
import { buildStockCatalog } from '@/lib/garage/preset-catalog';
import type { SlotIndex } from '@/lib/garage/types';
import { useGarageEditor } from '@/lib/garage/use-garage-editor';

export function StarterPicker({
  slot,
  disabled,
}: {
  slot: SlotIndex | null;
  disabled?: boolean;
}) {
  const { ruleset, dispatch, applyStock } = useGarageEditor();
  const catalog = buildStockCatalog(ruleset);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="md" disabled={disabled || slot === null}>
          + PRESET
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] overflow-y-auto">
        {MACHINE_TYPES.map((type, i) => {
          const builds = catalog[type] ?? [];
          if (builds.length === 0) return null;
          return (
            <DropdownMenuGroup key={type}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="flex items-center gap-2">
                <UnitIcon type={UNIT_ICON_KEY[type]} className="w-5 text-text-muted" />
                {MACHINE_TYPE_LABEL[type]}
              </DropdownMenuLabel>
              {builds.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onSelect={() => {
                    if (slot === null) return;
                    applyStock(slot, preset);
                    dispatch({ type: 'selectMachine', slot });
                  }}
                >
                  <span className="type-body-sm text-text-strong">{preset.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
