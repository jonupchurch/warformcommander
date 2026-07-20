import Link from "next/link";
import { Diamond } from "lucide-react";

export interface IdentityBadgeProps {
  /** e.g. "CMDR_JUPCHURCH" */
  commander: string;
  /** e.g. "GOLD III" */
  rank?: string;
  /** e.g. 1486 */
  mmr?: number;
  /** → Profile (identity-linked destination) */
  href?: string;
}

/**
 * Commander identity in the header — name (display face) over rank/MMR (mono, orange), plus the
 * avatar tile that doubles as the Profile entry point. Long names truncate rather than push the
 * nav (FR-006, edge cases). Real identity is wired by Feature 7 (auth); the shell just renders it.
 */
export function IdentityBadge({ commander, rank, mmr, href = "/profile" }: IdentityBadgeProps) {
  const meta = [rank, mmr != null ? `${mmr} MMR` : null].filter(Boolean).join(" · ");
  return (
    <Link
      href={href}
      aria-label={`${commander} — profile`}
      className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="flex min-w-0 flex-col items-end">
        <span className="max-w-[22ch] truncate font-display text-body-sm font-bold leading-none text-text-strong font-stretch-110%">
          {commander}
        </span>
        {meta && <span className="type-eyebrow mt-1 text-orange-500">{meta}</span>}
      </span>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-md border border-faction-friendly/40 bg-surface text-faction-friendly"
      >
        <Diamond className="size-4" />
      </span>
    </Link>
  );
}
