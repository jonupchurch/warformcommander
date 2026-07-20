import * as React from "react";

import { cn } from "@/lib/utils";

/** tone → the family/faction/zone token that tints border + text (the tags across the mockups). */
const TONE = {
  kinetic: "border-family-kinetic text-family-kinetic",
  energy: "border-family-energy text-family-energy",
  explosive: "border-family-explosive text-family-explosive",
  support: "border-family-support text-family-support",
  flex: "border-family-flex text-family-flex",
  friendly: "border-faction-friendly text-faction-friendly",
  enemy: "border-faction-enemy text-faction-enemy",
  air: "border-zone-air text-zone-air",
  front: "border-zone-front text-zone-front",
  middle: "border-zone-middle text-zone-middle",
  rear: "border-zone-rear text-zone-rear",
  neutral: "border-border-strong text-text-muted",
} as const;

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: keyof typeof TONE;
  /** outline = border+text tint (default); solid = adds a faint tinted fill */
  variant?: "outline" | "solid";
}

export function Chip({ tone = "neutral", variant = "outline", className, children, ...props }: ChipProps) {
  return (
    <span
      data-slot="chip"
      className={cn(
        "type-eyebrow inline-flex items-center rounded-sm border px-2 py-1",
        TONE[tone],
        // Neutral dark fill — never tint toward the text color (that lowers contrast under AA).
        variant === "solid" && "bg-surface-raised",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
