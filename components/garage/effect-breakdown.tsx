'use client';

/**
 * The "what your choices actually do" breakdown that fills the space below the Customize surface's
 * controls. Each selected choice gets a card: its name, a short blurb, and its concrete effects —
 * all numbers computed from the live ruleset (see `lib/garage/explain`), so the panel cannot drift
 * out of step with a balance change.
 *
 * Presentational only; the explanations themselves are pure and unit-tested.
 */

import { SectionLabel } from '@/components/ui/section-label';
import type { EffectLine, Explanation } from '@/lib/garage/explain';
import { cn } from '@/lib/utils';

const TONE_CLASS: Record<NonNullable<EffectLine['tone']>, string> = {
  gain: 'text-family-support',
  cost: 'text-text-muted',
  none: 'text-text-faint',
};

/** One explained choice: eyebrow (which slot), title, blurb, effect rows, optional caveat. */
export function ExplanationCard({ slotLabel, ex }: { slotLabel: string; ex: Explanation }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-sunken p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-body-sm font-medium text-text-strong">{ex.title}</span>
        <span className="type-eyebrow shrink-0 text-text-dim">{slotLabel}</span>
      </div>

      {ex.blurb && <p className="type-body-sm text-text-muted">{ex.blurb}</p>}

      {ex.effects.length > 0 && (
        <dl className="mt-0.5 flex flex-col gap-1">
          {ex.effects.map((e, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <dt className="type-eyebrow shrink-0 text-text-dim">{e.label}</dt>
              <dd
                className={cn(
                  'type-body-sm text-right',
                  e.tone ? TONE_CLASS[e.tone] : 'text-text-strong',
                )}
              >
                {e.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {ex.caveat && (
        <p className="type-body-sm rounded border border-border bg-surface px-2 py-1 text-text-muted">
          ⚠ {ex.caveat}
        </p>
      )}
    </div>
  );
}

/** A titled group of explanation cards. */
export function EffectBreakdown({
  title,
  index,
  items,
}: {
  title: string;
  index: string;
  items: { slotLabel: string; ex: Explanation }[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel index={index} rule={false} className="text-text-muted">
        {title}
      </SectionLabel>
      <div className="flex flex-col gap-2">
        {items.map((it, i) => (
          <ExplanationCard key={i} slotLabel={it.slotLabel} ex={it.ex} />
        ))}
      </div>
    </section>
  );
}
