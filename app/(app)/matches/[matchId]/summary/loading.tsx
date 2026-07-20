/** Battle Summary route skeleton (Feature 6, T001/T029) — the outcome hero + panels silhouette
 * while the result loads. */
export default function SummaryLoading() {
  return (
    <div aria-hidden className="flex animate-pulse flex-col gap-4">
      <div className="h-40 rounded-xl border border-border bg-surface-sunken" />
      <div className="h-28 rounded-xl border border-border bg-surface-rail" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-56 rounded-xl border border-border bg-surface-rail" />
        <div className="h-56 rounded-xl border border-border bg-surface-rail" />
      </div>
    </div>
  );
}
