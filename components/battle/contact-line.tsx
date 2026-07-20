/**
 * `ContactLine` (Feature 5, T014) — the neutral center strip between the two sides, with a glowing
 * node whose position tracks playback `progress` (0..1). Pure render of a single number.
 *
 * The node's movement is gated behind `motion-safe:` (FR-020): under reduced motion it **snaps** to
 * each tick instead of easing, and the position is always exact — the readout never depends on the
 * animation. Token-only; the glow reuses the Feature 3 `--shadow-glow-cyan`.
 */

import { cn } from '@/lib/utils';

export interface ContactLineProps {
  /** currentTick / lastTick, 0..1 → the node's vertical position along the line. */
  progress: number;
  className?: string;
}

export function ContactLine({ progress, className }: ContactLineProps) {
  const top = `${Math.min(100, Math.max(0, progress * 100))}%`;
  return (
    <div
      data-slot="contact-line"
      className={cn(
        'relative flex items-center justify-center border-x border-border',
        // Dashed neutral band (repeating gradient via a utility-safe inline background).
        'bg-[repeating-linear-gradient(0deg,var(--color-surface-raised)_0_8px,transparent_8px_16px)]',
        className,
      )}
    >
      <span className="type-eyebrow text-[0.5rem] text-text-faint [writing-mode:vertical-rl] [transform:rotate(180deg)]">
        CONTACT LINE
      </span>
      <div className="absolute inset-y-3.5 w-0.5 rounded-full bg-border" aria-hidden />
      <div
        aria-hidden
        className="absolute left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-strong shadow-glow-cyan motion-safe:transition-[top] motion-safe:duration-100 motion-safe:ease-linear"
        style={{ top }}
      />
    </div>
  );
}
