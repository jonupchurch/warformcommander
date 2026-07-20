import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The primary action primitive (FR-013/014). Token-only styling; the primary variant's glow is
 * gated behind `motion-safe:` (FR-020). `asChild` renders the styles onto a child element (e.g. a
 * `next/link`) via Radix Slot. Matches the Home/Garage/Arena CTAs.
 */
// Font sizing uses the `type-*` recipe utilities (which bundle family/weight/tracking/uppercase),
// NOT `text-{size}` — a `text-*` size class would collide with the variant's `text-{color}` under
// tailwind-merge and get the color dropped.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-colors motion-safe:duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-faction-friendly text-void hover:bg-cyan-300 motion-safe:shadow-glow-cyan",
        secondary: "border border-border-strong text-text-strong hover:bg-surface-raised",
        ghost: "text-text-muted hover:bg-surface-raised hover:text-text-strong",
      },
      size: {
        sm: "type-eyebrow h-8 px-3",
        md: "type-label h-10 px-5",
        lg: "type-label h-12 px-6",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export { buttonVariants };
