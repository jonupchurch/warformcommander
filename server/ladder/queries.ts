/**
 * Ladder read surface (Feature 9) — **read-only** over Feature 7's `ladder_standings`/`matches`/`users`
 * (P6, FR-015: Feature 7/8 are the sole writers). Composes/extends F7's `getLeaderboard` with the
 * metric + the **defined tiebreak** (contract §3), bot inclusion, and paging, and computes 1-based
 * ranks. Scalar columns only — no replay jsonb is ever parsed for the ladder.
 *
 * The board is public: these reads take no actor (mirroring F7's actor-less `getLeaderboard`/
 * `getStanding`); the page passes an optional viewer id purely to highlight the viewer's own row.
 */

import { and, asc, desc, eq, gt, or, sql, type SQL } from 'drizzle-orm';

import { getDb } from '@/db';
import { ladderStandings, matches, users } from '@/db/schema';

import { ok, type Result } from '../result';

export type LadderMetric = 'net' | 'damage' | 'defenses';
export type LadderRange = 'season' | 'week' | 'month';

/** The raw per-commander shape the queries return (scalar only). `netVictories` may be negative. */
export interface LadderRowData {
  userId: string;
  handle: string | null;
  isBot: boolean;
  rank: number;
  netVictories: number;
  attackWins: number;
  attackLosses: number;
  defenseWins: number;
  defenseLosses: number;
  currentStreak: number;
  bestStreak: number;
  totalDamage: number;
  matchesPlayed: number;
  metricValue: number;
}

export interface LadderQueryOpts {
  metric?: LadderMetric;
  range?: LadderRange;
  /** page size (clamped ≤ 100). */
  limit?: number;
  /** 1-based page (offset paging — correct at v1 scale; keyset is a later refinement). */
  page?: number;
  /** default TRUE (P5 never-empty); false ⇒ humans-only. */
  includeBots?: boolean;
}

export type ViewerStanding = ({ state: 'ranked' } & LadderRowData) | { state: 'unranked' };

export interface LadderPage {
  rows: LadderRowData[];
  totalRanked: number;
  /** true when another page exists after this one (offset paging). */
  hasMore: boolean;
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

/** `metricValue` for the selected metric — the value the metric column shows + orders by. */
function metricValueOf(metric: LadderMetric, r: { netVictories: number; totalDamage: number; defenseWins: number }): number {
  return metric === 'damage' ? r.totalDamage : metric === 'defenses' ? r.defenseWins : r.netVictories;
}

/** The ORDER BY for a metric: selected metric DESC, then the deterministic tiebreak (contract §3). */
function orderFor(metric: LadderMetric): SQL[] {
  const net = desc(ladderStandings.netVictories);
  const dmg = desc(ladderStandings.totalDamage);
  const def = desc(ladderStandings.defenseWins);
  const id = asc(ladderStandings.userId);
  if (metric === 'damage') return [dmg, net, id];
  if (metric === 'defenses') return [def, net, id];
  return [net, dmg, id];
}

/** Bot filter (P5): default includes bots so the board is never empty; false ⇒ humans only. */
function botFilter(includeBots: boolean): SQL | undefined {
  return includeBots ? undefined : eq(users.isBot, false);
}

/**
 * The main board read. v1 serves `range="season"` from `ladder_standings`; `week`/`month` roll up
 * `matches` (see {@link periodPage}). Ordered by the metric with the defined tiebreak; ranks are the
 * 1-based positions in that total order.
 */
export async function getLadderPage(opts: LadderQueryOpts = {}): Promise<Result<LadderPage>> {
  const metric = opts.metric ?? 'net';
  const range = opts.range ?? 'season';
  const includeBots = opts.includeBots ?? true;
  const limit = clampLimit(opts.limit);
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const offset = (page - 1) * limit;

  if (range !== 'season') return periodPage({ ...opts, metric, range, includeBots, limit, page, offset });

  const db = getDb();
  const rows = await db
    .select({
      userId: ladderStandings.userId,
      handle: users.handle,
      name: users.name,
      isBot: users.isBot,
      netVictories: ladderStandings.netVictories,
      attackWins: ladderStandings.attackWins,
      attackLosses: ladderStandings.attackLosses,
      defenseWins: ladderStandings.defenseWins,
      defenseLosses: ladderStandings.defenseLosses,
      currentStreak: ladderStandings.currentStreak,
      bestStreak: ladderStandings.bestStreak,
      totalDamage: ladderStandings.totalDamage,
      matchesPlayed: ladderStandings.matchesPlayed,
    })
    .from(ladderStandings)
    .innerJoin(users, eq(ladderStandings.userId, users.id))
    .where(botFilter(includeBots))
    .orderBy(...orderFor(metric))
    .limit(limit + 1) // read one extra to know if another page exists
    .offset(offset);

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ladderStandings)
    .innerJoin(users, eq(ladderStandings.userId, users.id))
    .where(botFilter(includeBots));

  const hasMore = rows.length > limit;
  const pageRows: LadderRowData[] = rows.slice(0, limit).map((r, i) => {
    // net_victories is a generated column → drizzle types it nullable, but it is always computed.
    const netVictories = r.netVictories ?? 0;
    return {
      userId: r.userId,
      handle: r.handle ?? r.name,
      isBot: r.isBot,
      rank: offset + i + 1,
      netVictories,
      attackWins: r.attackWins,
      attackLosses: r.attackLosses,
      defenseWins: r.defenseWins,
      defenseLosses: r.defenseLosses,
      currentStreak: r.currentStreak,
      bestStreak: r.bestStreak,
      totalDamage: r.totalDamage,
      matchesPlayed: r.matchesPlayed,
      metricValue: metricValueOf(metric, { netVictories, totalDamage: r.totalDamage, defenseWins: r.defenseWins }),
    };
  });

  return ok({ rows: pageRows, totalRanked: n, hasMore });
}

/**
 * The signed-in viewer's own standing + **computed rank** (for the pinned card). Returns
 * `{ state: "unranked" }` when the viewer has no `ladder_standings` row (FR-012) — never a fabricated
 * rank. Range-aware: season reads `ladder_standings`; period ranges roll up `matches`.
 */
export async function getViewerStanding(
  viewerId: string,
  opts: { range?: LadderRange; metric?: LadderMetric; includeBots?: boolean } = {},
): Promise<Result<ViewerStanding>> {
  const metric = opts.metric ?? 'net';
  const range = opts.range ?? 'season';
  const includeBots = opts.includeBots ?? true;

  if (range !== 'season') return viewerPeriodStanding(viewerId, { metric, range, includeBots });

  const db = getDb();
  const [row] = await db
    .select({
      userId: ladderStandings.userId,
      handle: users.handle,
      name: users.name,
      isBot: users.isBot,
      netVictories: ladderStandings.netVictories,
      attackWins: ladderStandings.attackWins,
      attackLosses: ladderStandings.attackLosses,
      defenseWins: ladderStandings.defenseWins,
      defenseLosses: ladderStandings.defenseLosses,
      currentStreak: ladderStandings.currentStreak,
      bestStreak: ladderStandings.bestStreak,
      totalDamage: ladderStandings.totalDamage,
      matchesPlayed: ladderStandings.matchesPlayed,
    })
    .from(ladderStandings)
    .innerJoin(users, eq(ladderStandings.userId, users.id))
    .where(eq(ladderStandings.userId, viewerId))
    .limit(1);

  if (!row) return ok({ state: 'unranked' });

  const netVictories = row.netVictories ?? 0;
  const me = { userId: row.userId, netVictories, totalDamage: row.totalDamage, defenseWins: row.defenseWins };
  const rank = await rankOf(metric, me, includeBots);
  return ok({
    state: 'ranked',
    userId: row.userId,
    handle: row.handle ?? row.name,
    isBot: row.isBot,
    rank,
    netVictories,
    attackWins: row.attackWins,
    attackLosses: row.attackLosses,
    defenseWins: row.defenseWins,
    defenseLosses: row.defenseLosses,
    currentStreak: row.currentStreak,
    bestStreak: row.bestStreak,
    totalDamage: row.totalDamage,
    matchesPlayed: row.matchesPlayed,
    metricValue: metricValueOf(metric, me),
  });
}

/** 1 + (count of standings strictly ahead of `me` under the metric's composite order). */
async function rankOf(
  metric: LadderMetric,
  me: { userId: string; netVictories: number; totalDamage: number; defenseWins: number },
  includeBots: boolean,
): Promise<number> {
  const ahead = strictlyAhead(metric, me);
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(ladderStandings)
    .innerJoin(users, eq(ladderStandings.userId, users.id))
    .where(includeBots ? ahead : and(ahead, eq(users.isBot, false)));
  return n + 1;
}

/** The "strictly ahead of me" predicate for a metric's composite key (primary DESC, tiebreaks). */
function strictlyAhead(
  metric: LadderMetric,
  me: { userId: string; netVictories: number; totalDamage: number; defenseWins: number },
): SQL {
  const net = ladderStandings.netVictories;
  const dmg = ladderStandings.totalDamage;
  const def = ladderStandings.defenseWins;
  const id = ladderStandings.userId;
  // primary DESC → "ahead" means a strictly greater primary, or equal-primary greater secondary, etc.
  if (metric === 'damage') {
    return or(
      gt(dmg, me.totalDamage),
      and(eq(dmg, me.totalDamage), gt(net, me.netVictories)),
      and(eq(dmg, me.totalDamage), eq(net, me.netVictories), sql`${id} < ${me.userId}`),
    )!;
  }
  if (metric === 'defenses') {
    return or(
      gt(def, me.defenseWins),
      and(eq(def, me.defenseWins), gt(net, me.netVictories)),
      and(eq(def, me.defenseWins), eq(net, me.netVictories), sql`${id} < ${me.userId}`),
    )!;
  }
  return or(
    gt(net, me.netVictories),
    and(eq(net, me.netVictories), gt(dmg, me.totalDamage)),
    and(eq(net, me.netVictories), eq(dmg, me.totalDamage), sql`${id} < ${me.userId}`),
  )!;
}

// --- Period rollups (US3) — implemented in Phase 5 ------------------------------------------------

interface PeriodOpts {
  metric: LadderMetric;
  range: LadderRange;
  includeBots: boolean;
  limit: number;
  page: number;
  offset: number;
}

async function periodPage(opts: PeriodOpts): Promise<Result<LadderPage>> {
  void opts;
  void matches; // the windowed GROUP BY over `matches` is wired in US3 (T029)
  return ok({ rows: [], totalRanked: 0, hasMore: false });
}

async function viewerPeriodStanding(
  viewerId: string,
  opts: { metric: LadderMetric; range: LadderRange; includeBots: boolean },
): Promise<Result<ViewerStanding>> {
  void viewerId;
  void opts;
  return ok({ state: 'unranked' });
}
