/**
 * Battle Playback route (Feature 5, T002) — a Server Component that will fetch + gate the stored
 * Replay (Feature 7 `getReplay`, ownership-checked) and hand a typed Replay to the client
 * {@link BattlePlayer}. Foundational skeleton: the fetch + player wiring land in US1 (T016). The
 * reader gates `formatVersion` inside the player; an unsupported/missing replay falls to `error.tsx`.
 */
export default async function BattlePage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;

  return (
    <section className="flex flex-col gap-3">
      <h1 className="type-h1 text-text-strong">Battle Playback</h1>
      <p className="type-body max-w-prose text-text-muted">
        The watchable battlefield and working scrubber for match{' '}
        <span className="text-text-strong">{matchId}</span> land with User Stories 1–2. The
        engine-free replay reader + playback state machine are already in place.
      </p>
    </section>
  );
}
