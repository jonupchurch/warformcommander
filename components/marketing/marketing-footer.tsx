import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Wordmark } from "@/components/brand/wordmark";

/** A footer link column. */
interface LinkColumn {
  heading: string;
  links: { label: string; href: string }[];
}

const COLUMNS: LinkColumn[] = [
  {
    heading: "Game",
    links: [
      { label: "Overview", href: "/#overview" },
      { label: "News", href: "/news" },
      { label: "Roadmap", href: "/#roadmap" },
    ],
  },
  {
    heading: "Community",
    links: [
      { label: "Discord", href: "/#community" },
      { label: "Reddit", href: "/#community" },
      { label: "Wishlist", href: "/#community" },
    ],
  },
  {
    heading: "More",
    links: [
      { label: "How to Play", href: "/#overview" },
      { label: "Dispatches (RSS)", href: "/feed.xml" },
    ],
  },
];

/**
 * The marketing footer (T023, FR-004): brand blurb + Game/Community/More link columns + copyright.
 * Token-only styling; reflows to a single column in portrait and multiple columns in landscape (P7).
 */
export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-surface-chrome">
      <div className="px-safe mx-auto grid max-w-shell grid-cols-1 gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-4">
          <Link
            href="/"
            aria-label="Warform Commander home"
            className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Logo />
            <Wordmark size="sm" />
          </Link>
          <p className="type-body-sm max-w-prose text-text-muted">
            A non-pay-to-win sci-fi tactics auto-battler. Skill lives in the plan — never the wallet.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.heading} aria-label={col.heading} className="flex flex-col gap-3">
            <h2 className="type-eyebrow text-text-dim">{col.heading}</h2>
            {col.links.map((l) => (
              <Link
                key={`${col.heading}-${l.label}`}
                href={l.href}
                className="type-body-sm w-fit rounded-sm text-text-muted transition-colors hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>

      <div className="px-safe mx-auto max-w-shell border-t border-border-hairline py-6">
        <p className="type-eyebrow text-text-faint">© Warform Commander. All systems nominal.</p>
      </div>
    </footer>
  );
}
