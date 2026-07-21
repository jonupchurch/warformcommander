/**
 * Metric + range display labels (Feature 9) — shared by the table header, cards, and the metric/range
 * tabs so a metric reads identically wherever it appears.
 */

import type { LadderMetric, LadderRange } from '@/server/ladder/queries';

export const METRIC_LABEL: Record<LadderMetric, string> = {
  net: 'NET VICTORIES',
  damage: 'TOTAL DAMAGE',
  defenses: 'DEFENSES HELD',
};

export const RANGE_LABEL: Record<LadderRange, string> = {
  season: 'SEASON',
  week: 'THIS WEEK',
  month: 'THIS MONTH',
};
