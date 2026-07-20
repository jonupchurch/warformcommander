/**
 * Battle Summary route (Feature 6, T001) — a Server Component that will fetch the persisted
 * `MatchResult` + `meta` for `matchId` (Feature 7, ownership-scoped), derive the display ViewModel,
 * and render the outcome hero + panels inside the Feature 3 shell. Foundational skeleton: the fetch,
 * derivation, and composition land in US1 (T013). A missing/unowned/unrenderable match falls to
 * `error.tsx`.
 */
export default async function BattleSummaryPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;

  return (
    <section className="flex flex-col gap-3">
      <h1 className="type-h1 text-text-strong">Battle Summary</h1>
      <p className="type-body max-w-prose text-text-muted">
        The post-match outcome, series breakdown, and damage report for match{' '}
        <span className="text-text-strong">{matchId}</span> land with User Stories 1–4.
      </p>
    </section>
  );
}
