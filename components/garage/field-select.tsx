'use client';

/**
 * A shared select-styled dropdown control — a trigger that shows the current pick and a menu of
 * options (`DropdownMenuItem` children). Used by the loadout, dial, and Plan-B editors so every
 * picker looks and behaves the same.
 */

import type { ReactNode } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

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
  return (
    <DropdownMenu>
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
      <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
