'use client';

/**
 * Battle Summary error boundary (Feature 6, T001/T029, FR-018) — the graceful state for a missing
 * match, a match not owned by the viewer, or an unrenderable result. Renders no partial summary.
 */

import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';

export default function SummaryError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Panel inset="sunken" className="flex flex-col items-start gap-3">
      <h1 className="type-h2 text-text-strong">Summary unavailable</h1>
      <p className="type-body max-w-prose text-text-muted">
        This match summary can&rsquo;t be shown — the match is missing, isn&rsquo;t yours, or its
        result couldn&rsquo;t be read. No partial result is shown.
      </p>
      <Button type="button" variant="secondary" size="sm" onClick={reset}>
        Try again
      </Button>
    </Panel>
  );
}
