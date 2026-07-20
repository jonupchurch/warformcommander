import { BracketFrame } from "@/components/ui/bracket-frame";
import { cn } from "@/lib/utils";

type LogoVariant = "badge" | "mono" | "knockout" | "on-light" | "favicon";

/** Per-variant fill/stroke for the two wedges + divider — all token-driven (no raw hex). */
const VARIANT: Record<LogoVariant, { player: string; enemy: string; divider: string }> = {
  badge: {
    player: "fill-faction-friendly/20 stroke-faction-friendly",
    enemy: "fill-faction-enemy-brand/20 stroke-faction-enemy-brand",
    divider: "stroke-text-strong",
  },
  favicon: {
    player: "fill-faction-friendly/20 stroke-faction-friendly",
    enemy: "fill-faction-enemy-brand/20 stroke-faction-enemy-brand",
    divider: "stroke-text-strong",
  },
  mono: {
    player: "fill-current/15 stroke-current",
    enemy: "fill-current/15 stroke-current",
    divider: "stroke-current",
  },
  knockout: {
    player: "fill-none stroke-current",
    enemy: "fill-none stroke-current",
    divider: "stroke-current",
  },
  "on-light": {
    player: "fill-none stroke-void",
    enemy: "fill-none stroke-void",
    divider: "stroke-void",
  },
};

export interface LogoProps {
  variant?: LogoVariant;
  /** px height; default per variant */
  size?: number;
  /** wrap in the corner-bracket frame */
  withBracket?: boolean;
  /** accessible name; omit → decorative (aria-hidden) */
  title?: string;
  className?: string;
}

/**
 * The Warform two-wedge mark: a cyan player wedge, a white divider/node, a magenta enemy wedge —
 * the armies converging on a seam (Logo Directions). Every color is a token, so it recolors with
 * the theme and stays hex-free (SC-002).
 */
export function Logo({ variant = "badge", size, withBracket = false, title, className }: LogoProps) {
  const v = VARIANT[variant];
  const height = size ?? (variant === "favicon" ? 32 : 24);
  const svg = (
    <svg
      viewBox="0 0 160 100"
      fill="none"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ height }}
      className={cn("w-auto", className)}
    >
      <polygon points="8,18 8,82 46,50" strokeWidth={7} strokeLinejoin="round" className={v.player} />
      <polygon
        points="152,18 152,82 114,50"
        strokeWidth={7}
        strokeLinejoin="round"
        className={v.enemy}
      />
      <line x1="80" y1="16" x2="80" y2="84" strokeWidth={7} strokeLinecap="round" className={v.divider} />
    </svg>
  );
  return withBracket ? <BracketFrame className="p-1.5">{svg}</BracketFrame> : svg;
}
