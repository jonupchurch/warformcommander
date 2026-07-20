import * as React from "react";

import { cn } from "@/lib/utils";

export interface BracketFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * The steel corner "reticle" — four L-shaped brackets framing content. In the mockups this is a
 * logo-lockup device (Brand Foundation / Logo Directions); exposed here as a reusable decorative
 * frame per the contract (T036). Purely decorative — brackets are aria-hidden.
 */
export function BracketFrame({ className, children, ...props }: BracketFrameProps) {
  const corner = "pointer-events-none absolute size-3 border-steel-500";
  return (
    <div className={cn("relative", className)} {...props}>
      <span aria-hidden className={cn(corner, "left-0 top-0 border-l-2 border-t-2")} />
      <span aria-hidden className={cn(corner, "right-0 top-0 border-r-2 border-t-2")} />
      <span aria-hidden className={cn(corner, "bottom-0 left-0 border-b-2 border-l-2")} />
      <span aria-hidden className={cn(corner, "bottom-0 right-0 border-b-2 border-r-2")} />
      {children}
    </div>
  );
}
