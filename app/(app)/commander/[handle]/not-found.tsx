/** Unknown-commander not-found (Feature 10, FR-005) — a calm dead-end with a way back to the Ladder. */

import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function CommanderNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="type-display text-2xl text-text-strong">COMMANDER NOT FOUND</h1>
      <p className="type-body text-sm text-text-muted">
        No commander goes by that handle. They may have never enlisted, or the link is mistyped.
      </p>
      <Button asChild variant="secondary" size="lg">
        <Link href="/ladder">Back to the Ladder</Link>
      </Button>
    </div>
  );
}
