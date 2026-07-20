/**
 * `ContactLine` (Feature 5, T014/T036) — the neutral strip between the two sides, with a glowing node
 * whose position tracks playback `progress` (0..1). **Orientation-responsive (P7)**: a horizontal
 * strip between the stacked sides in portrait (node moves left→right), a vertical strip between the
 * two columns in landscape (node moves top→bottom) — one markup, driven by the `--p` custom property.
 *
 * The node's movement is gated behind `motion-safe:` (FR-020): under reduced motion it **snaps** to
 * each tick and the position is always exact — the readout never depends on the animation. Token-only.
 */

import type { CSSProperties } from 'react';

import { cn } from '@/lib/utils';

export interface ContactLineProps {
  /** currentTick / lastTick, 0..1 → the node's position along the line. */
  progress: number;
  className?: string;
}

export function ContactLine({ progress, className }: ContactLineProps) {
  const p = `${Math.min(100, Math.max(0, progress * 100))}%`;
  return (
    <div
      data-slot="contact-line"
      className={cn(
        'relative flex min-h-8 items-center justify-center border-y border-border bg-surface-sunken/40',
        'lg:min-h-0 lg:border-x lg:border-y-0',
        className,
      )}
    >
      <span
        aria-hidden
        className="hidden text-[0.5rem] tracking-[0.28em] text-text-faint lg:inline lg:[writing-mode:vertical-rl] lg:transform-[rotate(180deg)]"
      >
        CONTACT LINE
      </span>

      {/* The line: horizontal in portrait, vertical in landscape. */}
      <div
        aria-hidden
        className="absolute inset-x-3.5 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-border lg:hidden"
      />
      <div
        aria-hidden
        className="absolute inset-y-3.5 left-1/2 hidden w-0.5 -translate-x-1/2 rounded-full bg-border lg:block"
      />

      {/* The progress node — centered on the point in both orientations via the `--p` position. */}
      <div
        aria-hidden
        style={{ '--p': p } as CSSProperties}
        className={cn(
          'absolute left-(--p) top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
          'bg-text-strong shadow-glow-cyan lg:left-1/2 lg:top-(--p)',
          'motion-safe:transition-[left,top] motion-safe:duration-100 motion-safe:ease-linear',
        )}
      />
    </div>
  );
}
