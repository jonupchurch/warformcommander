"use client";

import Link from "next/link";
import { ChevronDown, Diamond, LogIn, LogOut, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { signOutAction } from "./session-actions";

export interface IdentityMenuProps {
  /** Present when signed in; omitted for a guest (who gets a Log In button instead). */
  identity?: {
    /** e.g. "CMDR_JUPCHURCH" */
    commander: string;
    /** e.g. "GOLD III" */
    rank?: string;
    /** e.g. 1486 */
    mmr?: number;
    /** → Profile (identity-linked destination) */
    href?: string;
  };
}

/**
 * The commander identity control in the header. Signed in, the name becomes a click-flyout
 * (Radix DropdownMenu — an *actions* menu, unlike the garage's informational hover cards) offering
 * **Profile** and **Log Out**. Signed out, the slot instead offers **Log In** — previously the app
 * could only be entered by hitting Play, with no direct login. Long names truncate rather than push
 * the nav. Log Out runs the server action (real database-session sign-out); Log In reuses the app's
 * existing `/api/auth/signin` entry point.
 */
export function IdentityMenu({ identity }: IdentityMenuProps) {
  if (!identity) {
    return (
      <Button asChild size="sm" variant="secondary">
        <Link href="/api/auth/signin">
          <LogIn className="size-4" />
          Log In
        </Link>
      </Button>
    );
  }

  const { commander, rank, mmr, href = "/profile" } = identity;
  const meta = [rank, mmr != null ? `${mmr} MMR` : null].filter(Boolean).join(" · ");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${commander} — account menu`}
        className="group flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-text-muted transition-transform motion-safe:duration-150 group-data-[state=open]:rotate-180"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem asChild>
          <Link href={href}>
            <User className="size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full">
              <LogOut className="size-4" />
              Log Out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
