"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wrench, Swords, Trophy, Target, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface NavDestination {
  id: string;
  label: string;
  href: string;
  Icon: LucideIcon;
}

const DEFAULT_DESTINATIONS: NavDestination[] = [
  { id: "garage", label: "Garage", href: "/garage", Icon: Wrench },
  { id: "arena", label: "Arena", href: "/arena", Icon: Swords },
  { id: "ladder", label: "Ladder", href: "/ladder", Icon: Trophy },
  { id: "practice", label: "Practice", href: "/practice", Icon: Target },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export interface PrimaryNavProps {
  destinations?: NavDestination[];
}

/**
 * The primary destinations rendered as **both** chromes — top tabs in landscape, a viewport-pinned
 * bottom bar in portrait (research C1/C2). Both are in the DOM; the `lg:` display toggles use
 * `display:none`, so only one nav is in the a11y tree (and only one has a *visible* active item) at
 * any width. Active state via `usePathname` → cyan fill + `aria-current` (FR-007/FR-008).
 */
export function PrimaryNav({ destinations = DEFAULT_DESTINATIONS }: PrimaryNavProps) {
  const pathname = usePathname();
  return (
    <>
      {/* Landscape: top tabs (live inside the header) */}
      <nav aria-label="Primary" className="hidden items-center gap-1.5 lg:flex">
        {destinations.map((d) => {
          const active = isActive(pathname, d.href);
          return (
            <Link
              key={d.id}
              href={d.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "type-label rounded-md px-3.5 py-2 transition-colors motion-safe:duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active ? "bg-faction-friendly text-void" : "text-text-muted hover:text-text-strong",
              )}
            >
              {d.label}
            </Link>
          );
        })}
      </nav>

      {/* Portrait: viewport-pinned bottom tab bar; ≥44px targets, safe-area padded */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-surface-chrome pb-[env(safe-area-inset-bottom)] [backdrop-filter:blur(var(--blur-chrome))] lg:hidden"
      >
        {destinations.map((d) => {
          const active = isActive(pathname, d.href);
          const Icon = d.Icon;
          return (
            <Link
              key={d.id}
              href={d.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-1 py-2 transition-colors",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                active ? "text-faction-friendly" : "text-text-muted",
              )}
            >
              <Icon className="size-5" aria-hidden />
              <span className="type-eyebrow">{d.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
