/**
 * `deriveSummaryViewModel` (Feature 6, T005) — the **pure, total** derivation that turns a Feature-1
 * `MatchResult` into the display ViewModel every Battle Summary component renders. No I/O, no engine,
 * no re-simulation: a deterministic function of `(result, ctx)` (SC-001/003, contract guarantees).
 *
 * Perspective comes from `ctx.viewerSide` — swapping it flips the verdict and every `SidePair`
 * (FR-003). Every `MatchResult` field is represented (SC-001). `totals.damageDealt` is carried in
 * **raw milli-units** so it deep-equals `result.side*.damageDealt` exactly (SC-003, zero drift); the
 * renderers format for display. The optional `mvp` appears iff `ctx.perMachineDamage` is supplied.
 *
 * Note (conditionDetail): a `GameResult` exposes only winner/condition/tier/duration — not per-game
 * damage or the exact-tie flag — so a Time game is labelled "DMG" (won on damage at the cap). The
 * exact-tie→defender nuance isn't derivable here; surfacing it would need an engine result change.
 */

import type { MachineFate, MatchResult, Side } from '@/sim/model';
import type { WireUnit } from '@/sim/replay-reader';
import type { MachineTypeKey } from '@/components/brand/unit-icon';

import { avgHullLeftPct, milliToWhole, ticksToSeconds, unitsKilled, unitsLost } from './format';
import type { PerMachineDamage } from './mvp';

/** Engine `MachineTypeId` → Feature 3 `UnitIcon` key (the closed 7-type set; mirrors the render leaf). */
const ICON_KEY: Record<string, MachineTypeKey> = {
  HeavyTank: 'heavytank',
  LightTank: 'lighttank',
  Mech: 'mech',
  AttackHeli: 'heli',
  RocketArtillery: 'rocketarty',
  Artillery: 'artillery',
  RearSupport: 'support',
  Commander: 'support', // US5 — promoted support chassis, shares the support silhouette
};
const iconKeyOf = (typeId: string | undefined): MachineTypeKey => ICON_KEY[typeId ?? ''] ?? 'heavytank';

export interface SidePair {
  viewer: number;
  opponent: number;
}

export type Perspective = 'viewer' | 'opponent';

export interface BattleSummaryViewModel {
  outcome: {
    verdict: 'VICTORY' | 'DEFEAT';
    bestOf: number;
    seriesLabel: string;
    gamesWon: number;
    gamesLost: number;
    opponent: { name?: string; href?: string; hidden: boolean };
  };
  series: { game: number; result: 'W' | 'L' }[];
  perGame: {
    game: number;
    result: 'W' | 'L';
    condition: 'CONQUEST' | 'TIME';
    conditionDetail?: string;
    rewardTier: 'FULL' | 'LESSER';
    survivors?: { viewer: number; opponent: number };
    durationSeconds: string;
  }[];
  totals: {
    damageDealt: SidePair; // RAW milli-units — deep-equals result.side*.damageDealt (SC-003)
    unitsKilled: SidePair;
    unitsLost: SidePair;
    avgHullLeft: SidePair; // %
  };
  perMachine: {
    side: Perspective;
    typeKey: MachineTypeKey;
    variant: string;
    fate:
      | { kind: 'destroyed'; atTick: number; atSeconds: string }
      | { kind: 'survived'; hullPct: number };
  }[];
  mvp?: {
    typeKey: MachineTypeKey;
    variant: string;
    side: Perspective;
    damageDealt: number; // whole
    kills: number;
    damageAbsorbed: number; // whole
  };
  standing?: {
    mode: 'ranked' | 'practice';
    delta?: number;
    before?: number;
    after?: number;
    label: string;
  };
  actions: {
    watchReplayHref: string;
    findNextOpponentHref: string;
    backHref: string;
  };
}

export interface DeriveContext {
  viewerSide: Side;
  unitOrder: readonly WireUnit[];
  tickRate: number;
  opponent: { name?: string; href?: string; hidden: boolean };
  standing?: { mode: 'ranked' | 'practice'; delta?: number; before?: number; after?: number };
  replayRef: { matchId: string };
  /** optional per-actor damage (from `mvp.ts`) → enables the MVP; absent → MVP omitted (FR-010). */
  perMachineDamage?: PerMachineDamage[];
  /** optional per-game survivor counts (from the replay's per-game final snapshots) → per-game cards. */
  perGameSurvivors?: { viewer: number; opponent: number }[];
}

function standingOf(ctx: DeriveContext): BattleSummaryViewModel['standing'] {
  if (!ctx.standing) return undefined;
  if (ctx.standing.mode === 'practice') return { mode: 'practice', label: 'UNRANKED' };
  const delta = ctx.standing.delta ?? 0;
  const label = delta > 0 ? `+${delta} NET ${delta === 1 ? 'VICTORY' : 'VICTORIES'}` : 'NO CHANGE';
  return { mode: 'ranked', delta, before: ctx.standing.before, after: ctx.standing.after, label };
}

function mvpOf(result: MatchResult, ctx: DeriveContext): BattleSummaryViewModel['mvp'] {
  const damage = ctx.perMachineDamage;
  if (!damage || damage.length === 0) return undefined;
  const top = damage.reduce((best, d) => (d.damageDealt > best.damageDealt ? d : best));
  const unit = ctx.unitOrder[top.column];
  return {
    typeKey: iconKeyOf(unit?.typeId),
    variant: unit?.variantId ?? '',
    side: top.side === ctx.viewerSide ? 'viewer' : 'opponent',
    damageDealt: milliToWhole(top.damageDealt),
    kills: top.kills,
    damageAbsorbed: milliToWhole(top.damageAbsorbed),
  };
}

function perMachineOf(result: MatchResult, ctx: DeriveContext): BattleSummaryViewModel['perMachine'] {
  return result.machineFates.map((mf: MachineFate) => {
    const unit = ctx.unitOrder.find(
      (u) => u.side === mf.unit.side && u.instanceId === mf.unit.instanceId,
    );
    return {
      side: (mf.unit.side === ctx.viewerSide ? 'viewer' : 'opponent') as Perspective,
      typeKey: iconKeyOf(unit?.typeId),
      variant: unit?.variantId ?? '',
      fate:
        'destroyedAtTick' in mf.fate
          ? {
              kind: 'destroyed' as const,
              atTick: mf.fate.destroyedAtTick,
              atSeconds: ticksToSeconds(mf.fate.destroyedAtTick, ctx.tickRate),
            }
          : { kind: 'survived' as const, hullPct: Math.round(mf.fate.survivedWithHullPct / 100) },
    };
  });
}

export function deriveSummaryViewModel(
  result: MatchResult,
  ctx: DeriveContext,
): BattleSummaryViewModel {
  const viewer = ctx.viewerSide;
  const opp: Side = viewer === 'A' ? 'B' : 'A';
  const isViewerWin = (winner: Side | null): boolean => winner === viewer;

  const gamesWon = result.games.filter((g) => g.winner === viewer).length;
  const gamesLost = result.games.filter((g) => g.winner === opp).length;

  const viewerSummary = viewer === 'A' ? result.sideA : result.sideB;
  const oppSummary = viewer === 'A' ? result.sideB : result.sideA;

  return {
    outcome: {
      verdict: result.winner === viewer ? 'VICTORY' : 'DEFEAT',
      bestOf: 3,
      seriesLabel: `${gamesWon} – ${gamesLost}`,
      gamesWon,
      gamesLost,
      opponent: {
        name: ctx.opponent.hidden ? undefined : ctx.opponent.name,
        href: ctx.opponent.hidden ? undefined : ctx.opponent.href,
        hidden: ctx.opponent.hidden,
      },
    },
    series: result.games.map((g, i) => ({ game: i + 1, result: isViewerWin(g.winner) ? 'W' : 'L' })),
    perGame: result.games.map((g, i) => ({
      game: i + 1,
      result: isViewerWin(g.winner) ? 'W' : 'L',
      condition: g.condition === 'Conquest' ? 'CONQUEST' : 'TIME',
      conditionDetail: g.condition === 'Time' ? 'DMG' : undefined,
      rewardTier: g.rewardTier === 'Full' ? 'FULL' : 'LESSER',
      survivors: ctx.perGameSurvivors?.[i],
      durationSeconds: ticksToSeconds(g.durationTicks, ctx.tickRate),
    })),
    totals: {
      damageDealt: { viewer: viewerSummary.damageDealt, opponent: oppSummary.damageDealt },
      unitsKilled: { viewer: unitsKilled(oppSummary.survivors), opponent: unitsKilled(viewerSummary.survivors) },
      unitsLost: { viewer: unitsLost(viewerSummary.survivors), opponent: unitsLost(oppSummary.survivors) },
      avgHullLeft: { viewer: avgHullLeftPct(result.machineFates, viewer), opponent: avgHullLeftPct(result.machineFates, opp) },
    },
    perMachine: perMachineOf(result, ctx),
    mvp: mvpOf(result, ctx),
    standing: standingOf(ctx),
    actions: {
      watchReplayHref: `/battle/${ctx.replayRef.matchId}`,
      findNextOpponentHref: '/arena',
      backHref: '/arena',
    },
  };
}
