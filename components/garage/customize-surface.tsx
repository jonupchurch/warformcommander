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
import type { EditorPane } from '@/lib/garage/types';
import { useGarageEditor } from '@/lib/garage/use-garage-editor';
import { cn } from '@/lib/utils';

import { DialEditor } from './dial-editor';
import { LoadoutEditor } from './loadout-editor';
import { PlanBEditor } from './planb-editor';
import { PresetPicker } from './preset-picker';

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'type-label -mb-px border-b-2 px-3 py-2 transition-colors',
        active
          ? 'border-faction-friendly text-text-strong'
          : 'border-transparent text-text-muted hover:text-text-strong',
      )}
    >
      {children}
    </button>
  );
}

export function CustomizeSurface() {
  const { session, dispatch } = useGarageEditor();
  const slot = session.selection.selectedSlot;
  const machine = slot === null ? null : session.draft.machines[slot];
  if (machine === null) return null;

  // Loadout / Dials / Presets are surfaced as tabs; any other pane falls back to Loadout.
  const active = session.selection.activePane;
  const pane: EditorPane = active === 'Dials' || active === 'Presets' ? active : 'Loadout';
  const setPane = (next: EditorPane) => dispatch({ type: 'setActivePane', pane: next });

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
        <div className="flex gap-1 border-b border-border px-4">
          <Tab active={pane === 'Loadout'} onClick={() => setPane('Loadout')}>
            LOADOUT
          </Tab>
          <Tab active={pane === 'Dials'} onClick={() => setPane('Dials')}>
            BEHAVIOR
          </Tab>
          <Tab active={pane === 'Presets'} onClick={() => setPane('Presets')}>
            PRESETS
          </Tab>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {pane === 'Dials' ? (
            <div className="flex flex-col gap-6">
              <DialEditor />
              <PlanBEditor />
            </div>
          ) : pane === 'Presets' ? (
            <PresetPicker />
          ) : (
            <LoadoutEditor />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
