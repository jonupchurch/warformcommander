import * as React from "react";

import { cn } from "@/lib/utils";

const INSET = {
  rail: "bg-surface-rail",
  sunken: "bg-surface-sunken",
  raised: "bg-surface-raised",
} as const;

export interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  /** surface variant; default = surface */
  inset?: keyof typeof INSET;
  bordered?: boolean;
  radius?: "lg" | "xl";
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
}

/** The workhorse container — the pervasive panel-on-void bordered card (FR-013). */
export function Panel({
  as: Comp = "section",
  inset,
  bordered = true,
  radius = "lg",
  eyebrow,
  actions,
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <Comp
      data-slot="panel"
      className={cn(
        inset ? INSET[inset] : "bg-surface",
        bordered && "border border-border",
        radius === "xl" ? "rounded-xl" : "rounded-lg",
        "p-5",
        className,
      )}
      {...props}
    >
      {(eyebrow || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {eyebrow ? <div className="type-eyebrow text-text-muted">{eyebrow}</div> : <span />}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Comp>
  );
}
