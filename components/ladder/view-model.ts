/**
 * Ladder display view-model (Feature 9) — pure mapping from the raw {@link LadderRowData} (+ the
 * viewer id) to what a row/card renders. No data access. The load-bearing bits under test: the
 * **signed** net-victory label (negatives keep their sign — FR-003), the record string, the
 * viewer-own flag, and the Profile href.
 */

import type { LadderMetric, LadderRowData, ViewerStanding } from '@/server/ladder/queries';

export interface LadderRow {
  userId: string;
  rank: number;
  handle: string;
  profileHref: string;
  netVictories: number;
  netVictoriesLabel: string;
  record: string;
  streak: { current: number; best: number };
  totalDamage: number;
  metric: LadderMetric;
  metricValueLabel: string;
  isViewer: boolean;
  isBot: boolean;
}

export type ViewerStandingVM =
  | { state: 'ranked'; row: LadderRow }
  | { state: 'unranked'; ctaHref: string };

/** A signed integer label: `+18`, `-7`, `0`. Negatives keep their sign (FR-003). */
export function signedLabel(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** The commander's display handle, or a stable fallback derived from the id. */
function handleOf(data: { handle: string | null; userId: string }): string {
  const h = data.handle?.trim();
  return h && h.length > 0 ? h : `Commander ${data.userId.slice(0, 6)}`;
}

/** `22-9 · 14-3D` — attack W–L · defense W–L (holds–losses), the D marking the defense pair. */
function recordOf(d: LadderRowData): string {
  return `${d.attackWins}-${d.attackLosses} · ${d.defenseWins}-${d.defenseLosses}D`;
}

/** The formatted value of the selected metric (damage → grouped digits; net → signed). */
function metricValueLabelOf(metric: LadderMetric, d: LadderRowData): string {
  if (metric === 'damage') return d.totalDamage.toLocaleString();
  if (metric === 'defenses') return String(d.defenseWins);
  return signedLabel(d.netVictories);
}

/** Map one raw row to its display shape. */
function toRow(d: LadderRowData, viewerUserId: string | null, metric: LadderMetric): LadderRow {
  return {
    userId: d.userId,
    rank: d.rank,
    handle: handleOf(d),
    // The public profile route is `/commander/[handle]` (resolved by handle, FR-005). Link by the raw
    // handle, URL-encoded; the old `/profile/${userId}` matched no route and 404'd every name.
    profileHref: d.handle ? `/commander/${encodeURIComponent(d.handle)}` : `/commander/${d.userId}`,
    netVictories: d.netVictories,
    netVictoriesLabel: signedLabel(d.netVictories),
    record: recordOf(d),
    streak: { current: d.currentStreak, best: d.bestStreak },
    totalDamage: d.totalDamage,
    metric,
    metricValueLabel: metricValueLabelOf(metric, d),
    isViewer: viewerUserId != null && d.userId === viewerUserId,
    isBot: d.isBot,
  };
}

/** The board rows for rendering, in the order the query returned them. */
export function toLadderRows(data: LadderRowData[], viewerUserId: string | null, metric: LadderMetric): LadderRow[] {
  return data.map((d) => toRow(d, viewerUserId, metric));
}

/** The pinned viewer card: a ranked row (always flagged `isViewer`) or the unranked Arena CTA. */
export function toViewerStanding(v: ViewerStanding, metric: LadderMetric): ViewerStandingVM {
  if (v.state === 'unranked') return { state: 'unranked', ctaHref: '/arena' };
  // `v` carries every LadderRowData field (plus the narrowed `state`), so it maps directly.
  return { state: 'ranked', row: toRow(v, v.userId, metric) };
}
