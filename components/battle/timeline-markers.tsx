/**
 * `TimelineMarkers` (Feature 5, T030) — the Plan-B / death annotations overlaid on the scrubber track
 * (FR-015). Each marker is a focusable/activatable button positioned at `marker.position * 100%`,
 * tinted by kind/side, carrying `marker.label` as its accessible name; activating one is an O(1)
 * `onSeek(marker.tick)`. Pure render of the memoized `deriveMarkers(gameIndex)` array — no per-frame
 * work. The container is `pointer-events-none` so only the marker dots intercept clicks; the rest of
 * the track still seeks via the underlying slider. Token-only.
 */

import type { TimelineMarker } from '@/sim/replay-view';
import { cn } from '@/lib/utils';

export interface TimelineMarkersProps {
  markers: TimelineMarker[];
  onSeek(tick: number): void;
  className?: string;
}

/** Kind/side → token tint: death = the side's faction color; Plan-B = the middle-zone accent. */
function tint(marker: TimelineMarker): string {
  if (marker.kind === 'planb') return 'bg-zone-middle';
  return marker.side === 'friendly' ? 'bg-faction-friendly' : 'bg-faction-enemy';
}

export function TimelineMarkers({ markers, onSeek, className }: TimelineMarkersProps) {
  if (markers.length === 0) return null;
  return (
    <div
      data-slot="timeline-markers"
      aria-hidden={false}
      className={cn('pointer-events-none absolute inset-0 z-10', className)}
    >
      {markers.map((marker, i) => (
        <button
          key={`${marker.kind}-${marker.unitInstanceId}-${marker.tick}-${i}`}
          type="button"
          onClick={() => onSeek(marker.tick)}
          aria-label={marker.label}
          title={marker.label}
          style={{ left: `${Math.min(100, Math.max(0, marker.position * 100))}%` }}
          className={cn(
            'pointer-events-auto absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full',
            'ring-1 ring-void/60 transition-transform hover:scale-y-150',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            tint(marker),
          )}
        />
      ))}
    </div>
  );
}
