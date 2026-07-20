import * as React from "react";

import { cn } from "@/lib/utils";

export interface GridBackdropProps extends React.HTMLAttributes<HTMLDivElement> {
  scanlines?: boolean;
  glow?: "cyan" | "split" | "none";
}

/**
 * The grid + scanline battlefield texture (Brand/Home/Arena backgrounds). Decorative and static
 * (no motion). Layers are built from tokens (steel line, faction-soft glows) — no raw hex.
 */
export function GridBackdrop({
  scanlines = true,
  glow = "cyan",
  className,
  children,
  ...props
}: GridBackdropProps) {
  const layers = [
    "repeating-linear-gradient(0deg, rgb(var(--steel-rgb) / 0.04) 0 1px, transparent 1px 30px)",
    "repeating-linear-gradient(90deg, rgb(var(--steel-rgb) / 0.04) 0 1px, transparent 1px 30px)",
  ];
  if (glow === "cyan" || glow === "split") {
    layers.unshift("radial-gradient(60% 55% at 15% 0%, var(--faction-friendly-soft), transparent 70%)");
  }
  if (glow === "split") {
    layers.unshift("radial-gradient(60% 55% at 85% 100%, var(--faction-enemy-soft), transparent 70%)");
  }
  return (
    <div className={cn("relative isolate", className)} {...props}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: layers.join(", ") }}
      />
      {scanlines && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-40"
          style={{
            background: "repeating-linear-gradient(0deg, rgb(0 0 0 / 0.12) 0 1px, transparent 1px 3px)",
          }}
        />
      )}
      {children}
    </div>
  );
}
