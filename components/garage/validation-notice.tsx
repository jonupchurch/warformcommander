'use client';

/**
 * Renders a set of `validate()` reasons (T021, FR-016) — the human message the shared engine produced,
 * shown against its slot/zone/squad context. Client convenience; the server-side validate is the
 * authority (a server rejection is surfaced here too).
 */

import type { ValidationError } from '@/sim/legality';
import { cn } from '@/lib/utils';

export function ValidationNotice({
  errors,
  className,
}: {
  errors: ValidationError[];
  className?: string;
}) {
  if (errors.length === 0) return null;
  return (
    <ul role="alert" className={cn('flex flex-col gap-1.5', className)}>
      {errors.map((e, i) => (
        <li key={`${e.code}-${e.instanceId}-${i}`} className="flex items-start gap-2">
          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-faction-enemy" />
          <span className="type-body-sm text-text-muted">{e.reason}</span>
        </li>
      ))}
    </ul>
  );
}
