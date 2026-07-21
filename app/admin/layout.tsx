import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Logo } from "@/components/brand/logo";
import { Wordmark } from "@/components/brand/wordmark";

/**
 * The admin console layout (Feature 12, US2/T025) — the **first server-side gate** and the console's
 * own chrome (sibling to the player `(app)` shell and the public `(marketing)` shell). It reads the
 * session server-side (`auth()`, the DB session — never a client flag) and redirects any anonymous or
 * non-admin request before an admin RSC renders. Every admin Server Action / route re-checks
 * authorization independently (the `requireAdmin()` re-check / the webhook secret), so security never
 * rests on this layer alone (research B1, CVE-2025-29927).
 *
 * NB: the optional `proxy.ts` UX-redirect layer was omitted — Next.js 16's proxy loader rejects the
 * NextAuth v5 `auth()` wrapper ("must export a function named `proxy` or a default function"), and the
 * contract makes the proxy explicitly UX-only ("deleting it degrades UX, not security"). This RSC
 * redirect provides the same bounce; the action/webhook checks remain the security boundary.
 */
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/balance", label: "Balance" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");
  if (session.user.role !== "admin") redirect("/");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-surface-chrome [backdrop-filter:blur(var(--blur-chrome))]">
        <div className="px-safe mx-auto flex h-16 max-w-shell items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" aria-label="Admin home" className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <Logo />
              <Wordmark size="sm" />
            </Link>
            <span className="type-eyebrow rounded-sm border border-faction-friendly px-2 py-1 text-faction-friendly">
              Admin
            </span>
          </div>
          <nav aria-label="Admin" className="flex items-center gap-1">
            {NAV.map((d) => (
              <Link
                key={d.href}
                href={d.href}
                className="type-label rounded-md px-3 py-2 text-text-muted transition-colors hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {d.label}
              </Link>
            ))}
            <Link
              href="/"
              className="type-label rounded-md px-3 py-2 text-text-dim transition-colors hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Exit
            </Link>
          </nav>
        </div>
      </header>

      <main className="px-safe mx-auto w-full max-w-shell flex-1 py-8">{children}</main>
    </div>
  );
}
