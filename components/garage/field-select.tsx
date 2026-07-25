'use client';

/**
 * A shared select-styled dropdown control — a trigger that shows the current pick and a menu of
 * options (`DropdownMenuItem` children). Used by the loadout, dial, and Plan-B editors so every
 * picker looks and behaves the same.
 *
 * It also owns a single **hovered-option** id (context below): the loadout pickers show a stat flyout
 * for the hovered option, and driving every flyout off one shared value guarantees that exactly one is
 * open at a time — moving between options swaps it cleanly, and closing the menu (or leaving it) clears
 * it. Pickers that don't use flyouts simply ignore the context.
 */

import { createContext, useContext, useState, type ReactNode } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface FieldSelectHover {
  /** The id of the option whose flyout is showing, or `null`. */
  hovered: string | null;
  setHovered: (id: string | null) => void;
}

const FieldSelectHoverContext = createContext<FieldSelectHover>({
  hovered: null,
  setHovered: () => {},
});

/** The single hovered-option id for the enclosing {@link FieldSelect} (for stat flyouts). */
export const useFieldSelectHover = () => useContext(FieldSelectHoverContext);

export function FieldSelect({
  current,
  children,
  ariaLabel,
  className,
}: {
  current: ReactNode;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <FieldSelectHoverContext.Provider value={{ hovered, setHovered }}>
      <DropdownMenu
        open={open}
        onOpenChange={(next: boolean) => {
          setOpen(next);
          if (!next) setHovered(null); // menu closed → drop any lingering flyout
        }}
      >
        <DropdownMenuTrigger
          aria-label={ariaLabel}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            className,
          )}
        >
          <span className="type-body-sm truncate text-text-strong">{current}</span>
          <span aria-hidden className="type-readout text-text-dim">
            ▾
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-72 w-64 overflow-y-auto"
          // Pointer left the whole menu → clear the flyout (per-item enter still drives the rest).
          onPointerLeave={() => setHovered(null)}
        >
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </FieldSelectHoverContext.Provider>
  );
}
