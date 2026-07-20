'use client';

/**
 * Battle route error boundary (T002/T039, FR-003/SC-007) — the graceful "replay unavailable"
 * state for a missing/failed fetch or an unsupported `formatVersion` (regeneration is the server's
 * job, Feature 7). It renders **zero battle frames** — never a partial or mis-rendered battlefield.
 */

import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';

export default function BattleError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Panel inset="sunken" className="flex flex-col items-start gap-3">
      <h1 className="type-h2 text-text-strong">Replay unavailable</h1>
      <p className="type-body max-w-prose text-text-muted">
        This battle can&rsquo;t be played right now — the replay is missing, failed to load, or is in
        a format this build can&rsquo;t read. No partial battle is shown.
      </p>
      <Button type="button" variant="secondary" size="sm" onClick={reset}>
        Try again
      </Button>
    </Panel>
  );
}
