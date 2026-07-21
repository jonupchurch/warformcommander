import { SectionLabel } from "@/components/ui/section-label";

/** News-index skeleton (T036) — a lightweight placeholder while the feed streams in. */
export default function NewsLoading() {
  return (
    <div className="px-safe mx-auto max-w-shell py-12 sm:py-16" aria-hidden>
      <SectionLabel>News feed</SectionLabel>
      <div className="mt-6 h-9 w-48 rounded-md bg-surface-raised" />
      <div className="mt-10 h-48 rounded-xl bg-surface-raised" />
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-lg bg-surface-raised" />
        ))}
      </div>
    </div>
  );
}
