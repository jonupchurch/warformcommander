/** Battle route skeleton (T002) — the two-side battlefield + control cluster silhouette while the
 * replay loads. */
export default function BattleLoading() {
  return (
    <div aria-hidden className="flex animate-pulse flex-col gap-4">
      <div className="h-10 rounded-md border border-border bg-surface-rail" />
      <div className="h-[28rem] rounded-lg border border-border bg-surface-sunken" />
      <div className="h-16 rounded-lg border border-border bg-surface-rail" />
    </div>
  );
}
