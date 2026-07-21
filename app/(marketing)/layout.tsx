import { MarketingShell } from "@/components/shell/marketing-shell";

/**
 * The public marketing route group's layout — a thin wrapper around {@link MarketingShell}, mirroring
 * how `app/(app)/layout.tsx` wraps the authenticated `AppShell`. Route groups don't change the URL,
 * so Home stays at `/`, News at `/news`, articles at `/news/[slug]` — all sharing this one shell.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
