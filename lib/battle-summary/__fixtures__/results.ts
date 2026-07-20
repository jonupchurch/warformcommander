/**
 * `MatchResult` fixture battery (Feature 6, T002) — the shapes the Battle Summary must represent
 * faithfully (SC-001/003/005): a 2-0 Conquest sweep, a 2-1 with a middle-game Time loss, a viewer
 * defeat, a Time-tiebreak win, an exact-tie→defender game, a total wipe, and an all-survivors Time
 * game. Each is a **valid Feature-1 `MatchResult`** (`sim/model.ts`) paired with the `meta.unitOrder`
 * that gives the machines identity. Damage is in milli-units (÷1000 for whole), hull% in basis points.
 */

import type { Fate, GameResult, MachineFate, MatchResult, Side } from '@/sim/model';
import type { WireUnit } from '@/sim/replay-reader';

/** Five machines per side, varied types — the identity `machineFates`/MVP join against. */
export const UNIT_ORDER: WireUnit[] = [
  { side: 'A', instanceId: 0, typeId: 'HeavyTank', variantId: 'Grizzly' },
  { side: 'A', instanceId: 1, typeId: 'AttackHeli', variantId: 'Gunship' },
  { side: 'A', instanceId: 2, typeId: 'RocketArtillery', variantId: 'Sentry' },
  { side: 'A', instanceId: 3, typeId: 'Artillery', variantId: 'Longbow' },
  { side: 'A', instanceId: 4, typeId: 'RearSupport', variantId: 'Medic' },
  { side: 'B', instanceId: 0, typeId: 'HeavyTank', variantId: 'Bulwark' },
  { side: 'B', instanceId: 1, typeId: 'Mech', variantId: 'Vanguard' },
  { side: 'B', instanceId: 2, typeId: 'RocketArtillery', variantId: 'Deluge' },
  { side: 'B', instanceId: 3, typeId: 'LightTank', variantId: 'Scout' },
  { side: 'B', instanceId: 4, typeId: 'RearSupport', variantId: 'Warden' },
];

const dead = (tick: number): Fate => ({ destroyedAtTick: tick });
const alive = (pctBp: number): Fate => ({ survivedWithHullPct: pctBp });

const game = (
  winner: Side | null,
  condition: GameResult['condition'],
  rewardTier: GameResult['rewardTier'],
  durationTicks: number,
): GameResult => ({ winner, condition, rewardTier, durationTicks });

function fates(side: Side, list: Fate[]): MachineFate[] {
  return list.map((fate, instanceId) => ({ unit: { side, instanceId }, fate }));
}

function makeResult(opts: {
  winner: Side;
  games: GameResult[];
  fatesA: Fate[];
  fatesB: Fate[];
  damageA: number;
  damageB: number;
}): MatchResult {
  const survivors = (list: Fate[]) => list.filter((f) => 'survivedWithHullPct' in f).length;
  return {
    winner: opts.winner,
    games: opts.games,
    machineFates: [...fates('A', opts.fatesA), ...fates('B', opts.fatesB)],
    sideA: { damageDealt: opts.damageA, survivors: survivors(opts.fatesA) },
    sideB: { damageDealt: opts.damageB, survivors: survivors(opts.fatesB) },
    durationTicks: opts.games.reduce((sum, g) => sum + g.durationTicks, 0),
  };
}

/** A 2-0 Conquest sweep — A wins both games by wiping B; A keeps 4 machines. */
export const sweep20: MatchResult = makeResult({
  winner: 'A',
  games: [game('A', 'Conquest', 'Full', 82), game('A', 'Conquest', 'Full', 91)],
  fatesA: [alive(5200), alive(8800), alive(6100), dead(74), alive(4300)],
  fatesB: [dead(31), dead(45), dead(52), dead(60), dead(88)],
  damageA: 9_850_000,
  damageB: 4_274_000,
});

/** A 2-1 win with a middle-game Time loss (B wins G2 on damage at the tick cap). */
export const winWithTimeLoss21: MatchResult = makeResult({
  winner: 'A',
  games: [
    game('A', 'Conquest', 'Full', 88),
    game('B', 'Time', 'Lesser', 1000),
    game('A', 'Conquest', 'Full', 96),
  ],
  fatesA: [alive(4100), dead(210), alive(3300), dead(410), alive(2600)],
  fatesB: [dead(120), dead(340), dead(560), dead(720), dead(900)],
  damageA: 11_200_000,
  damageB: 6_050_000,
});

/** A viewer defeat from A's seat (B wins 2-0). */
export const defeat20: MatchResult = makeResult({
  winner: 'B',
  games: [game('B', 'Conquest', 'Full', 77), game('B', 'Conquest', 'Full', 84)],
  fatesA: [dead(40), dead(52), dead(61), dead(70), dead(83)],
  fatesB: [alive(6600), alive(7200), dead(58), alive(5100), alive(8900)],
  damageA: 3_980_000,
  damageB: 10_540_000,
});

/** A Time-tiebreak win — A wins the deciding game on damage at the cap (never Conquest). */
export const timeTiebreakWin: MatchResult = makeResult({
  winner: 'A',
  games: [
    game('A', 'Conquest', 'Full', 90),
    game('B', 'Conquest', 'Full', 85),
    game('A', 'Time', 'Lesser', 1000),
  ],
  fatesA: [alive(2200), alive(1500), dead(640), dead(880), alive(900)],
  fatesB: [dead(210), alive(1100), dead(700), alive(400), dead(950)],
  damageA: 8_400_000,
  damageB: 7_900_000,
});

/**
 * An exact-tie→defender game: B is the defender and wins the deciding Time game on the exact-tie
 * tiebreak. Consumers can only see condition=Time + the winner; the exact-tie nuance isn't in
 * `GameResult`, so the ViewModel labels Time games "DMG" (see the view-model note).
 */
export const exactTieDefender: MatchResult = makeResult({
  winner: 'B',
  games: [
    game('A', 'Conquest', 'Full', 92),
    game('B', 'Conquest', 'Full', 80),
    game('B', 'Time', 'Lesser', 1000),
  ],
  fatesA: [dead(300), alive(1200), dead(500), alive(800), dead(990)],
  fatesB: [alive(1400), dead(410), alive(600), dead(700), alive(1000)],
  damageA: 7_100_000,
  damageB: 7_100_000,
});

/** A total wipe of the viewer (A) — 0 survivors, 0% avg hull. */
export const totalWipe: MatchResult = makeResult({
  winner: 'B',
  games: [game('B', 'Conquest', 'Full', 66), game('B', 'Conquest', 'Full', 71)],
  fatesA: [dead(20), dead(28), dead(35), dead(41), dead(50)],
  fatesB: [alive(9000), alive(8500), alive(7800), alive(6600), alive(9500)],
  damageA: 2_100_000,
  damageB: 12_800_000,
});

/** An all-survivors Time game — the match ends at the cap with every machine alive on both sides. */
export const allSurvivorsTime: MatchResult = makeResult({
  winner: 'A',
  games: [game('A', 'Time', 'Lesser', 1000), game('A', 'Time', 'Lesser', 1000)],
  fatesA: [alive(9000), alive(8000), alive(7000), alive(6000), alive(9500)],
  fatesB: [alive(5000), alive(4000), alive(3000), alive(2000), alive(4500)],
  damageA: 6_400_000,
  damageB: 5_200_000,
});

/** The whole battery, for table-driven full-field/shape-coverage tests (SC-001/005). */
export const RESULT_BATTERY = {
  sweep20,
  winWithTimeLoss21,
  defeat20,
  timeTiebreakWin,
  exactTieDefender,
  totalWipe,
  allSurvivorsTime,
} as const;
