/**
 * Ladder searchParam parsing (Feature 9, Principle II) — validate + clamp the URL-controlled
 * `metric`/`range`/`page`/`humans` before any read. An unknown metric/range falls to its default; a
 * bad page clamps to 1. Nothing here trusts the raw string past these enums.
 */

import type { LadderMetric, LadderRange } from '@/server/ladder/queries';

const METRICS: readonly LadderMetric[] = ['net', 'damage', 'defenses'];
const RANGES: readonly LadderRange[] = ['season', 'week', 'month'];

export interface LadderParams {
  metric: LadderMetric;
  range: LadderRange;
  page: number;
  includeBots: boolean;
}

type Raw = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Parse + validate the ladder query params; unknown → default, out-of-range page → 1. */
export function parseLadderParams(sp: Raw): LadderParams {
  const metricRaw = first(sp.metric);
  const rangeRaw = first(sp.range);
  const pageRaw = first(sp.page);
  const humansRaw = first(sp.humans);

  const metric = (METRICS as readonly string[]).includes(metricRaw ?? '') ? (metricRaw as LadderMetric) : 'net';
  const range = (RANGES as readonly string[]).includes(rangeRaw ?? '') ? (rangeRaw as LadderRange) : 'season';
  const pageNum = Number(pageRaw);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.floor(pageNum) : 1;
  // Bots are included by default (P5 never-empty); `?humans=1` is the opt-in humans-only view.
  const includeBots = humansRaw !== '1' && humansRaw !== 'true';

  return { metric, range, page, includeBots };
}

/**
 * Build a `/ladder` href from the current params with `overrides` applied. Only non-default params are
 * serialized, so the canonical board is a clean `/ladder`. Changing the metric/range resets to page 1.
 */
export function buildLadderHref(base: LadderParams, overrides: Partial<LadderParams> = {}): string {
  const next = { ...base, ...overrides };
  // Any metric/range change implies a fresh first page unless a page was explicitly given.
  if ((overrides.metric || overrides.range) && overrides.page === undefined) next.page = 1;

  const sp = new URLSearchParams();
  if (next.metric !== 'net') sp.set('metric', next.metric);
  if (next.range !== 'season') sp.set('range', next.range);
  if (!next.includeBots) sp.set('humans', '1');
  if (next.page > 1) sp.set('page', String(next.page));
  const q = sp.toString();
  return q ? `/ladder?${q}` : '/ladder';
}
