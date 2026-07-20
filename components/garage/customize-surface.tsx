'use client';

/**
 * The Customize surface (T011 host) — a slide-over `Sheet` that opens from the unit detail's
 * `Customize Unit →` CTA and hosts the deep editor for the selected machine. US2 fills it with the
 * loadout editor; US3/US4 add the dial + Plan-B + preset sections. The `Sheet` works in both
 * orientations (a right-side panel that becomes a near-full-width overlay on narrow screens, P7).
 */

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { MACHINE_TYPE_LABEL } from '@/lib/garage/display';
import { useGarageEditor } from '@/lib/garage/use-garage-editor';

import { LoadoutEditor } from './loadout-editor';

export function CustomizeSurface() {
  const { session } = useGarageEditor();
  const slot = session.selection.selectedSlot;
  const machine = slot === null ? null : session.draft.machines[slot];
  if (machine === null) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="primary" size="lg" className="w-full">
          Customize Unit →
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full gap-0 border-border bg-surface-rail p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle className="type-h3 text-text-strong">
            Customize · {machine.variantId}
          </SheetTitle>
          <SheetDescription className="type-body-sm text-text-muted">
            {MACHINE_TYPE_LABEL[machine.typeId]} — every choice is a trade-off, never a strict upgrade.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <LoadoutEditor />
        </div>
      </SheetContent>
    </Sheet>
  );
}
