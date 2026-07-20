import * as React from "react";

import { cn } from "@/lib/utils";

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
}

/** A label + display-value tile (the readout blocks across Profile/Ladder/Summary). */
export function Stat({ label, value, className, ...props }: StatProps) {
  return (
    <div
      data-slot="stat"
      className={cn("flex flex-col gap-1 rounded-md border border-border bg-surface-sunken p-3", className)}
      {...props}
    >
      <span className="type-eyebrow text-text-muted">{label}</span>
      <span className="type-h3 text-text-strong">{value}</span>
    </div>
  );
}
