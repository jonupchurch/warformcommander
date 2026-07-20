/** Garage route skeleton (T001) — the 3-column rig's silhouette while the ruleset + roster load. */
export default function GarageLoading() {
  return (
    <div
      aria-hidden
      className="grid animate-pulse gap-4 lg:grid-cols-[288px_1fr_372px] lg:items-start"
    >
      <div className="h-96 rounded-lg border border-border bg-surface-rail" />
      <div className="h-[32rem] rounded-lg border border-border bg-surface-sunken" />
      <div className="h-[32rem] rounded-lg border border-border bg-surface-rail" />
    </div>
  );
}
