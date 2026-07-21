/**
 * Feature 9 ladder read surface (US1/US2) — ordering/tiebreak is the load-bearing determinism
 * contract (SC-001/SC-005). These pin `getLadderPage`/`getViewerStanding` against an independent sort
 * and known pools: net-DESC + tiebreak, negatives sort last + stable, computed rank + unranked, the
 * metric orderings, and defense-loss-lowers-rank (SC-002 — the design's stake).
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { getLadderPage, getViewerStanding, type LadderMetric } from '@/server/ladder/queries';

import { truncateAll, closeDb } from './db-setup';
import { seedMatch, seedStanding, seedUser } from './ladder-fixtures';

beforeEach(truncateAll);
afterAll(closeDb);

/** Independent JS oracle for a metric's composite order (primary DESC, tiebreaks, userId ASC). */
function expectedOrder(
  pool: { userId: string; net: number; dmg: number; def: number }[],
  metric: LadderMetric,
): string[] {
  const primary = (r: { net: number; dmg: number; def: number }) =>
    metric === 'damage' ? r.dmg : metric === 'defenses' ? r.def : r.net;
  return [...pool]
    .sort((a, b) => primary(b) - primary(a) || b.net - a.net || b.dmg - a.dmg || (a.userId < b.userId ? -1 : 1))
    .map((r) => r.userId);
}

describe('getLadderPage — net order + tiebreak (T008, SC-001)', () => {
  it('orders by net DESC, then totalDamage DESC, then userId ASC — zero discrepancy vs an independent sort', async () => {
    const pool = [
      { userId: await seedStanding({ attackWins: 20, defenseLosses: 2, totalDamage: 5000 }), net: 18, dmg: 5000, def: 0 },
      { userId: await seedStanding({ attackWins: 20, defenseLosses: 2, totalDamage: 9000 }), net: 18, dmg: 9000, def: 0 },
      { userId: await seedStanding({ attackWins: 30, defenseLosses: 2, totalDamage: 1000 }), net: 28, dmg: 1000, def: 0 },
      { userId: await seedStanding({ attackWins: 5, defenseLosses: 12, totalDamage: 8000 }), net: -7, dmg: 8000, def: 0 },
    ];

    const res = await getLadderPage({ metric: 'net' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.rows.map((r) => r.userId)).toEqual(expectedOrder(pool, 'net'));
    // rank is the 1-based position in that order
    expect(res.value.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(res.value.totalRanked).toBe(4);
  });
});

describe('getLadderPage — negatives sort last + stable (T009, SC-005)', () => {
  it('a negative net sorts below every non-negative and ties resolve identically across calls', async () => {
    await seedStanding({ attackWins: 3, defenseLosses: 10, totalDamage: 1 }); // net -7
    await seedStanding({ attackWins: 4, defenseLosses: 0, totalDamage: 1 }); // net +4
    await seedStanding({ attackWins: 0, defenseLosses: 0, totalDamage: 1 }); // net 0

    const a = await getLadderPage({ metric: 'net' });
    const b = await getLadderPage({ metric: 'net' });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const nets = a.value.rows.map((r) => r.netVictories);
    expect(nets).toEqual([4, 0, -7]); // negative last
    expect(a.value.rows.map((r) => r.userId)).toEqual(b.value.rows.map((r) => r.userId)); // stable
  });
});

describe('getViewerStanding — computed rank + unranked (T010, SC-006)', () => {
  it('returns the correct rank for an off-first-page viewer', async () => {
    // three ahead, then the viewer
    await seedStanding({ attackWins: 40, totalDamage: 1 });
    await seedStanding({ attackWins: 30, totalDamage: 1 });
    await seedStanding({ attackWins: 20, totalDamage: 1 });
    const me = await seedStanding({ attackWins: 10, totalDamage: 1 });

    const v = await getViewerStanding(me, { metric: 'net' });
    expect(v.ok).toBe(true);
    if (!v.ok || v.value.state !== 'ranked') return expect(v.ok && v.value.state).toBe('ranked');
    expect(v.value.rank).toBe(4);
  });

  it('returns { state: "unranked" } for a user with no standing row', async () => {
    const v = await getViewerStanding('nonexistent-user-id');
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.state).toBe('unranked');
  });
});

describe('getLadderPage — metric orderings (T022)', () => {
  it("metric='damage' orders by totalDamage DESC; metric='defenses' by defenseWins DESC", async () => {
    const pool = [
      { userId: await seedStanding({ attackWins: 2, defenseWins: 9, totalDamage: 100 }), net: 2, dmg: 100, def: 9 },
      { userId: await seedStanding({ attackWins: 2, defenseWins: 1, totalDamage: 900 }), net: 2, dmg: 900, def: 1 },
      { userId: await seedStanding({ attackWins: 2, defenseWins: 5, totalDamage: 500 }), net: 2, dmg: 500, def: 5 },
    ];

    const byDamage = await getLadderPage({ metric: 'damage' });
    const byDefenses = await getLadderPage({ metric: 'defenses' });
    expect(byDamage.ok && byDefenses.ok).toBe(true);
    if (!byDamage.ok || !byDefenses.ok) return;
    expect(byDamage.value.rows.map((r) => r.userId)).toEqual(expectedOrder(pool, 'damage'));
    expect(byDefenses.value.rows.map((r) => r.userId)).toEqual(expectedOrder(pool, 'defenses'));
    // metricValue reflects the selected metric
    expect(byDamage.value.rows.map((r) => r.metricValue)).toEqual([900, 500, 100]);
  });
});

describe('defense-loss-lowers-rank (T021, SC-002 — the design stake)', () => {
  it('an extra defense loss lowers net victories and rank vs an otherwise-identical commander', async () => {
    const strong = await seedStanding({ attackWins: 10, defenseLosses: 1, totalDamage: 500 }); // net 9
    const weakDefense = await seedStanding({ attackWins: 10, defenseLosses: 5, totalDamage: 500 }); // net 5

    const res = await getLadderPage({ metric: 'net' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const order = res.value.rows.map((r) => r.userId);
    expect(order.indexOf(strong)).toBeLessThan(order.indexOf(weakDefense)); // weak defense ranks lower
    const strongRow = res.value.rows.find((r) => r.userId === strong)!;
    const weakRow = res.value.rows.find((r) => r.userId === weakDefense)!;
    expect(strongRow.netVictories).toBeGreaterThan(weakRow.netVictories);
    expect(strongRow.rank).toBeLessThan(weakRow.rank);
  });
});

describe('period rollups — week/month over matches (T027/T028, US3)', () => {
  const DAYS_60_AGO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  it("range='week' rolls up ONLY ranked matches in-window; older matches are excluded (SC-007)", async () => {
    const a = await seedUser({ handle: 'A' });
    const b = await seedUser({ handle: 'B' });
    // in-window: A beats B (attack win for A, defense loss for B)
    await seedMatch({ attackerUserId: a, defenderUserId: b, winnerSide: 'attacker', attackerDamage: 100, defenderDamage: 50 });
    // out-of-window: a second A-beats-B, 60 days ago — must NOT count
    await seedMatch({ attackerUserId: a, defenderUserId: b, winnerSide: 'attacker', createdAt: DAYS_60_AGO });

    const res = await getLadderPage({ range: 'week', metric: 'net' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const rowA = res.value.rows.find((r) => r.userId === a)!;
    const rowB = res.value.rows.find((r) => r.userId === b)!;
    expect(rowA.netVictories).toBe(1); // exactly one in-window attack win (old excluded)
    expect(rowA.totalDamage).toBe(100);
    expect(rowA.attackWins).toBe(1);
    expect(rowB.netVictories).toBe(-1); // one in-window defense loss
    expect(rowB.defenseLosses).toBe(1);
    expect(res.value.totalRanked).toBe(2);
  });

  it("excludes practice matches from every rollup; an empty window is empty", async () => {
    const a = await seedUser();
    const b = await seedUser();
    await seedMatch({ attackerUserId: a, defenderUserId: b, winnerSide: 'attacker', mode: 'practice' });

    const week = await getLadderPage({ range: 'week' });
    expect(week.ok).toBe(true);
    if (!week.ok) return;
    expect(week.value.rows).toHaveLength(0); // practice-only window → nothing ranked
    expect(week.value.totalRanked).toBe(0);
  });

  it("range='season' reads ladder_standings, NOT a match rollup", async () => {
    // a standing with no matches at all → present in season, absent in week
    const x = await seedStanding({ handle: 'X', attackWins: 3, totalDamage: 10 }); // net 3

    const season = await getLadderPage({ range: 'season' });
    const week = await getLadderPage({ range: 'week' });
    expect(season.ok && week.ok).toBe(true);
    if (!season.ok || !week.ok) return;
    expect(season.value.rows.map((r) => r.userId)).toContain(x);
    expect(week.value.rows.map((r) => r.userId)).not.toContain(x); // no matches → not in the rollup
  });

  it("getViewerStanding is range-aware — in-window rank, or unranked when absent from the window", async () => {
    const a = await seedUser();
    const b = await seedUser();
    await seedMatch({ attackerUserId: a, defenderUserId: b, winnerSide: 'attacker' });

    const inWindow = await getViewerStanding(a, { range: 'week' });
    expect(inWindow.ok).toBe(true);
    if (!inWindow.ok) return;
    expect(inWindow.value.state).toBe('ranked');
    if (inWindow.value.state === 'ranked') expect(inWindow.value.rank).toBe(1); // A leads with net +1

    const absent = await getViewerStanding(await seedUser(), { range: 'week' });
    expect(absent.ok).toBe(true);
    if (absent.ok) expect(absent.value.state).toBe('unranked');
  });
});

describe('includeBots (P5 never-empty / FR-011)', () => {
  it('includes bots by default and can be filtered to humans only', async () => {
    await seedStanding({ isBot: true, attackWins: 5 });
    await seedStanding({ isBot: false, attackWins: 3 });

    const withBots = await getLadderPage({ includeBots: true });
    const humansOnly = await getLadderPage({ includeBots: false });
    expect(withBots.ok && humansOnly.ok).toBe(true);
    if (!withBots.ok || !humansOnly.ok) return;
    expect(withBots.value.totalRanked).toBe(2);
    expect(humansOnly.value.totalRanked).toBe(1);
    expect(humansOnly.value.rows.every((r) => !r.isBot)).toBe(true);
  });
});
