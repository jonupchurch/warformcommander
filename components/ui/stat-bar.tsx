import * as React from "react";

import { cn } from "@/lib/utils";

export interface StatBarProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: number;
  max?: number;
  /** right-aligned readout, e.g. "2400" */
  display?: string;
}

/** Track + cyan-gradient fill — the Garage stat bars (FR-013). */
export function StatBar({ label, value, max = 100, display, className, ...props }: StatBarProps) {
  const pct = Math.max(0, Math.min(100, max === 0 ? 0 : (value / max) * 100));
  return (
    <div className={cn("flex flex-col gap-1.5", className)} {...props}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="type-label text-text-muted">{label}</span>
        {display && <span className="type-readout text-text-strong">{display}</span>}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-track"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
