/**
 * Profile assembly (Feature 10) — **server-only, read-only** (P6, FR-021). Assembles a public
 * {@link ProfileViewModel} from Feature 7 tables: it selects **only public `users` columns** (never
 * `email`/`role`, SC-007), projects `ladder_standings` to career stats, maps recent `matches` to
 * display rows (practice opponents hidden, deleted participants graceful), and derives cosmetic badges.
 * Feature 10 owns no persistence and never writes; the additive read projections here are pure queries
 * over existing Feature 7 tables (no schema change, no new table).
 *
 * Server-only by usage (imported solely by the profile routes).
 */

import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { ladderStandings, squads, users } from '@/db/schema';
import type { SquadConfig } from '@/sim/model';
import type { MachineTypeKey } from '@/components/brand/unit-icon';
import { deriveBadges } from '@/lib/badges';
import { toCareerStats, toMatchRow, toWeekBuckets } from '@/lib/profile-stats';
import type { MostFieldedUnit, ProfileViewModel, SignatureSquad } from '@/lib/profile-types';

import { getStanding } from './standings';
import { listMatches } from './matches';
import { err, ok, type Result } from './result';

/** Only the public columns a profile may expose (FR-003, SC-007). */
interface PublicUser {
  id: string;
  handle: string | null;
  image: string | null;
  createdAt: Date;
  isBot: boolean;
}

const PUBLIC_COLUMNS = {
  id: users.id,
  handle: users.handle,
  image: users.image,
  createdAt: users.createdAt,
  isBot: users.isBot,
} as const;

const RECENT_LIMIT = 20;
const ACTIVITY_WEEKS = 8;

/** Engine `MachineTypeId` → the Feature 3 UnitIcon key + label (the closed 7-type set). */
const TYPE_TO_ICON: Record<string, { type: MachineTypeKey; label: string }> = {
  HeavyTank: { type: 'heavytank', label: 'Heavy Tank' },
  LightTank: { type: 'lighttank', label: 'Light Tank' },
  Mech: { type: 'mech', label: 'Mech' },
  AttackHeli: { type: 'heli', label: 'Attack Heli' },
  RocketArtillery: { type: 'rocketarty', label: 'Rocket Artillery' },
  Artillery: { type: 'artillery', label: 'Artillery' },
  Commander: { type: 'support', label: 'Commander' }, // US5 — promoted support chassis
};

/** The signed-in commander's own profile. */
export async function getOwnProfile(viewerId: string): Promise<Result<ProfileViewModel>> {
  const [subject] = await getDb().select(PUBLIC_COLUMNS).from(users).where(eq(users.id, viewerId)).limit(1);
  if (!subject) return err('NOT_FOUND', 'no such user');
  return ok(await assemble(subject, viewerId));
}

/** Any commander by handle (public view). `NOT_FOUND` → the route calls notFound() (FR-005). */
export async function getProfileByHandle(handle: string, viewerId: string | null): Promise<Result<ProfileViewModel>> {
  const [subject] = await getDb().select(PUBLIC_COLUMNS).from(users).where(eq(users.handle, handle)).limit(1);
  if (!subject) return err('NOT_FOUND', `no commander with handle ${handle}`);
  return ok(await assemble(subject, viewerId));
}

async function assemble(subject: PublicUser, viewerId: string | null): Promise<ProfileViewModel> {
  const db = getDb();

  // 1. career ← ladder_standings (recompute record/win-rate downstream)
  const standingRes = await getStanding(subject.id);
  const career = toCareerStats(standingRes.ok ? standingRes.value : zeroStandingFor(subject.id));

  // 2. recent matches (+ opponent handles resolved in one batch) → rows / activity / notable
  const matchesRes = await listMatches({ userId: subject.id, limit: RECENT_LIMIT });
  const rawMatches = matchesRes.ok ? matchesRes.value : [];

  const opponentIds = [
    ...new Set(
      rawMatches
        .map((m) => (m.attackerUserId === subject.id ? m.defenderUserId : m.attackerUserId))
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const handleRows = opponentIds.length
    ? await db.select({ id: users.id, handle: users.handle }).from(users).where(inArray(users.id, opponentIds))
    : [];
  const handleOf = new Map(handleRows.map((r) => [r.id, r.handle]));

  const recentMatches = rawMatches.map((m) => {
    const opponentId = m.attackerUserId === subject.id ? m.defenderUserId : m.attackerUserId;
    const opponentHandle = opponentId ? handleOf.get(opponentId) ?? null : null;
    return toMatchRow(m, subject.id, opponentHandle);
  });
  const activity = toWeekBuckets(rawMatches, subject.id, ACTIVITY_WEEKS);
  // Notable: the ranked wins with the biggest per-side damage (0..3), a light highlight.
  const notable = recentMatches.filter((r) => r.result === 'W' && !r.isPractice).slice(0, 3);

  // 3. signature squads + most-fielded unit + ladder position (additive read-only projections)
  const [signatureSquads, mostFieldedUnit, ladderRank] = await Promise.all([
    getSignatureSquads(subject.id, 4),
    getMostFieldedUnit(subject.id),
    getLadderPosition(subject.id, career.netVictories, career.matchesPlayed),
  ]);

  return {
    identity: {
      handle: subject.handle ?? `Commander ${subject.id.slice(0, 6)}`,
      avatarUrl: subject.image,
      enlistedAt: subject.createdAt,
      isBot: subject.isBot,
      isOwn: viewerId != null && viewerId === subject.id,
    },
    ladderRank,
    career,
    activity,
    recentMatches,
    notable,
    signatureSquads,
    mostFieldedUnit,
    badges: deriveBadges(career),
  };
}

function zeroStandingFor(userId: string) {
  return {
    userId,
    attackWins: 0,
    attackLosses: 0,
    defenseWins: 0,
    defenseLosses: 0,
    netVictories: 0,
    matchesPlayed: 0,
    totalDamage: 0,
    currentStreak: 0,
    bestStreak: 0,
    updatedAt: new Date(0),
  };
}

/** Most-played squads by games, with the subject's win-rate within each; deleted squad → placeholder. */
async function getSignatureSquads(userId: string, limit: number): Promise<SignatureSquad[]> {
  const rows = (await getDb().execute(sql`
    select m.attacker_squad_id as squad_id, s.name as squad_name,
      count(*)::int as games,
      count(*) filter (where m.winner_side = 'attacker')::int as wins
    from matches m
    left join squads s on s.id = m.attacker_squad_id
    where m.attacker_user_id = ${userId} and m.attacker_squad_id is not null
    group by m.attacker_squad_id, s.name
    order by games desc
    limit ${limit}
  `)) as unknown as { squad_id: string; squad_name: string | null; games: number; wins: number }[];

  return rows.map((r) => {
    const games = Number(r.games);
    return {
      name: r.squad_name ?? '[deleted squad]',
      games,
      winRatePct: games > 0 ? Math.round((Number(r.wins) / games) * 100) : 0,
    };
  });
}

/** The machine type the subject fields most across all their saved squads (null if they have none). */
async function getMostFieldedUnit(userId: string): Promise<MostFieldedUnit | null> {
  const rows = await getDb()
    .select({ config: squads.config })
    .from(squads)
    .where(eq(squads.userId, userId));
  if (rows.length === 0) return null;

  const counts = new Map<string, number>();
  let total = 0;
  for (const { config } of rows) {
    for (const machine of (config as SquadConfig).machines) {
      counts.set(machine.typeId, (counts.get(machine.typeId) ?? 0) + 1);
      total += 1;
    }
  }
  if (total === 0) return null;

  let topType = '';
  let topCount = 0;
  for (const [typeId, count] of counts) {
    if (count > topCount) {
      topType = typeId;
      topCount = count;
    }
  }
  const icon = TYPE_TO_ICON[topType];
  if (!icon) return null;
  return { type: icon.type, label: icon.label, pickPct: Math.round((topCount / total) * 100) };
}

/** Display-only ladder position (#N) from the net-victory order; null when the subject is unranked. */
async function getLadderPosition(userId: string, netVictories: number, matchesPlayed: number): Promise<number | null> {
  if (matchesPlayed === 0) return null; // never played ⇒ no standing to rank
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(ladderStandings)
    .where(and(isNotNull(ladderStandings.netVictories), sql`${ladderStandings.netVictories} > ${netVictories}`));
  return Number(n) + 1;
}
