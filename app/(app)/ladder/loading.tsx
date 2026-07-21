/** Ladder loading skeleton (Feature 9) — the shell keeps chrome; the board area shows placeholder bars. */
export default function LadderLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-7 w-40 rounded bg-surface-raised" />
        <div className="h-4 w-72 rounded bg-surface-raised/60" />
      </div>
      <div className="h-20 rounded-xl border border-border bg-surface-rail" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg border border-border bg-surface-rail" />
        ))}
      </div>
    </div>
  );
}
