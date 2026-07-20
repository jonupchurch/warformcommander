'use client';

/**
 * The `+ ADD UNIT` type picker (T020 entry point) — choosing a machine type seeds the slot with a
 * default legal build (`defaultFor`), so a fresh machine is immediately valid. Variant + loadout
 * refinement is US2/US4; this only chooses the type.
 */

import { UnitIcon } from '@/components/brand/unit-icon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MACHINE_TYPES, MACHINE_TYPE_LABEL, UNIT_ICON_KEY } from '@/lib/garage/display';
import type { MachineTypeId } from '@/sim/model';

export function TypePicker({
  onPick,
  disabled,
}: {
  onPick: (type: MachineTypeId) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="primary" size="md" disabled={disabled}>
          + ADD UNIT
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {MACHINE_TYPES.map((type) => (
          <DropdownMenuItem key={type} onSelect={() => onPick(type)} className="gap-2">
            <UnitIcon type={UNIT_ICON_KEY[type]} className="w-6 text-text-muted" />
            {MACHINE_TYPE_LABEL[type]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
