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
import { ladderStandings, users } from '@/db/schema';

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

// --- Period rollups (US3) — windowed GROUP BY over `matches` --------------------------------------
//
// Season reads the maintained `ladder_standings`; a period view instead rolls up **ranked** matches
// whose `created_at` falls in the calendar week/month (app-server tz, via `date_trunc(..., now())`).
// Each match contributes to two commanders — the attacker and the defender — so we UNION the two role
// contributions and GROUP BY user. `practice` matches are structurally excluded (`mode='ranked'`).
// Lifetime-only fields (streaks) are 0 in a period view (documented in the view-model note).

interface PeriodOpts {
  metric: LadderMetric;
  range: LadderRange;
  includeBots: boolean;
  limit: number;
  page: number;
  offset: number;
}

interface RolledRow {
  user_id: string;
  handle: string | null;
  name: string | null;
  is_bot: boolean;
  attack_wins: number;
  attack_losses: number;
  defense_wins: number;
  defense_losses: number;
  net_victories: number;
  total_damage: number;
  matches_played: number;
}

/** The window lower bound for a range (calendar week/month start, server tz). */
function windowStart(range: LadderRange): SQL {
  return range === 'week' ? sql`date_trunc('week', now())` : sql`date_trunc('month', now())`;
}

/** The in-window per-commander rollup CTE (before ordering/paging), joined to `users`. */
function rolledCte(range: LadderRange, includeBots: boolean): SQL {
  const start = windowStart(range);
  const botClause = includeBots ? sql`` : sql`where u."isBot" = false`;
  return sql`
    with contrib as (
      select m.attacker_user_id as user_id,
        case when m.winner_side = 'attacker' then 1 else 0 end as attack_win,
        case when m.winner_side = 'defender' then 1 else 0 end as attack_loss,
        0 as defense_win, 0 as defense_loss,
        m.attacker_damage as damage
      from matches m
      where m.mode = 'ranked' and m.created_at >= ${start} and m.attacker_user_id is not null
      union all
      select m.defender_user_id as user_id,
        0 as attack_win, 0 as attack_loss,
        case when m.winner_side = 'defender' then 1 else 0 end as defense_win,
        case when m.winner_side = 'attacker' then 1 else 0 end as defense_loss,
        m.defender_damage as damage
      from matches m
      where m.mode = 'ranked' and m.created_at >= ${start} and m.defender_user_id is not null
    ),
    rolled as (
      select c.user_id,
        sum(c.attack_win)::int as attack_wins,
        sum(c.attack_loss)::int as attack_losses,
        sum(c.defense_win)::int as defense_wins,
        sum(c.defense_loss)::int as defense_losses,
        (sum(c.attack_win) - sum(c.defense_loss))::int as net_victories,
        sum(c.damage)::bigint as total_damage,
        count(*)::int as matches_played
      from contrib c
      group by c.user_id
    )
    select r.*, u.handle, u.name, u."isBot" as is_bot
    from rolled r
    join "user" u on u.id = r.user_id
    ${botClause}
  `;
}

/** ORDER BY fragment for the rollup's computed columns (mirrors the season tiebreak, contract §3). */
function periodOrder(metric: LadderMetric): SQL {
  if (metric === 'damage') return sql`order by total_damage desc, net_victories desc, user_id asc`;
  if (metric === 'defenses') return sql`order by defense_wins desc, net_victories desc, user_id asc`;
  return sql`order by net_victories desc, total_damage desc, user_id asc`;
}

function rolledToData(r: RolledRow, metric: LadderMetric, rank: number): LadderRowData {
  const netVictories = Number(r.net_victories);
  const totalDamage = Number(r.total_damage);
  const defenseWins = Number(r.defense_wins);
  return {
    userId: r.user_id,
    handle: r.handle ?? r.name,
    isBot: r.is_bot,
    rank,
    netVictories,
    attackWins: Number(r.attack_wins),
    attackLosses: Number(r.attack_losses),
    defenseWins,
    defenseLosses: Number(r.defense_losses),
    currentStreak: 0, // lifetime-only concept — 0 in a period view
    bestStreak: 0,
    totalDamage,
    matchesPlayed: Number(r.matches_played),
    metricValue: metricValueOf(metric, { netVictories, totalDamage, defenseWins }),
  };
}

async function periodPage(opts: PeriodOpts): Promise<Result<LadderPage>> {
  const { metric, range, includeBots, limit, offset } = opts;
  const db = getDb();
  const cte = rolledCte(range, includeBots);

  const rows = (await db.execute(
    sql`${cte} ${periodOrder(metric)} limit ${limit + 1} offset ${offset}`,
  )) as unknown as RolledRow[];

  const countRes = (await db.execute(
    sql`select count(*)::int as n from (${cte}) sub`,
  )) as unknown as { n: number }[];
  const totalRanked = Number(countRes[0]?.n ?? 0);

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit).map((r, i) => rolledToData(r, metric, offset + i + 1));
  return ok({ rows: pageRows, totalRanked, hasMore });
}

async function viewerPeriodStanding(
  viewerId: string,
  opts: { metric: LadderMetric; range: LadderRange; includeBots: boolean },
): Promise<Result<ViewerStanding>> {
  const { metric, range, includeBots } = opts;
  const db = getDb();
  // The full ordered rollup, then find the viewer's position (v1 period pools are small).
  const rows = (await db.execute(
    sql`${rolledCte(range, includeBots)} ${periodOrder(metric)}`,
  )) as unknown as RolledRow[];

  const idx = rows.findIndex((r) => r.user_id === viewerId);
  if (idx < 0) return ok({ state: 'unranked' });
  return ok({ state: 'ranked', ...rolledToData(rows[idx], metric, idx + 1) });
}
