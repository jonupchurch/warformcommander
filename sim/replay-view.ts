/**
 * Battle-playback reader extension (Feature 5, T005–T007) — **pure, engine-free** helpers over
 * Feature 1's {@link ReplayReader}. Every function is an O(1) array index or a single pass over the
 * already-decoded replay; **nothing here imports `@wfc/engine-wasm` or simulates** (constitution P6,
 * the anti-regression for the previous game's broken viewer — SC-003/SC-005).
 *
 * The render projections (`BattleViewModel`/`UnitView`/`TimelineMarker`) are **pure functions of
 * `(gameIndex, tick)`** over the immutable replay (FR-017): a given tick always projects identically,
 * whether reached by play or seek. The per-unit max (for hull/shield bars) is the **tick-0 snapshot**
 * baseline — never an engine stat derivation (Assumptions; keeps the client a pure player).
 *
 * Layering note: this module holds **no UI type**. `UnitView` carries the raw `typeId`; the
 * `typeId → UnitIcon` mapping is the render leaf's job (`components/battle/unit-sprite.tsx`), so `sim/`
 * never depends on `components/`.
 */

import {
  parseReplay,
  ReplayReader,
  SCALE,
  ZONE_NAMES,
  type Side,
  type SnapshotRow,
  type WireEvent,
  type WireReplay,
  type WireUnit,
} from './replay-reader';

export type Faction = 'friendly' | 'enemy';

/** One unit at the current tick — the render-ready projection of its snapshot row. */
export interface UnitView {
  column: number;
  instanceId: number;
  typeId: string;
  variantId: string;
  side: Side;
  faction: Faction;
  hull: number; // whole units (display)
  shield: number;
  hullPct: number; // 0..1 vs the tick-0 baseline
  shieldPct: number; // 0..1 vs the tick-0 baseline (0 when the unit has no shield)
  hasShield: boolean;
  zone: (typeof ZONE_NAMES)[number];
  alive: boolean;
}

/** A ground zone's unit stack on one side. */
export interface GroundZoneView {
  zone: 'Front' | 'Middle' | 'Rear';
  isEmpty: boolean;
  units: UnitView[];
}

/** One side's battlefield: the Air row + the three ground zones (ordered toward the contact line). */
export interface SideView {
  air: UnitView[];
  airEmpty: boolean;
  ground: GroundZoneView[];
}

/** The per-side stat readout (mockup stat bar). */
export interface SideStats {
  alive: number;
  total: number;
  hull: number; // Σ current hull, whole units
  damageDealt: number; // opponent tick-0 hull total − opponent current hull total
}

/** The whole battlefield at one tick + the readouts derived from it. */
export interface BattleViewModel {
  player: SideView;
  enemy: SideView;
  stats: { player: SideStats; enemy: SideStats };
  tick: number;
  lastTick: number;
  progress: number; // currentTick / lastTick (0 when lastTick is 0)
}

export type MarkerKind = 'planb' | 'death';

/** A timeline annotation derived once per game from its `events`. */
export interface TimelineMarker {
  tick: number;
  kind: MarkerKind;
  side: Faction;
  unitInstanceId: number;
  label: string;
  position: number; // tick / lastTick (0..1)
}

/** The seek + projection surface the playback screen renders from. Pure, engine-free. */
export interface ReplayView {
  readonly gamesCount: number;
  readonly tickRate: number;
  readonly unitOrder: readonly WireUnit[];
  lastTick(gameIndex: number): number;
  snapshotAt(gameIndex: number, tick: number): SnapshotRow[]; // O(1) — the seek primitive
  eventsAt(gameIndex: number, tick: number): WireEvent[]; // O(1)
  unitMaxHull(gameIndex: number, column: number): number;
  unitMaxShield(gameIndex: number, column: number): number;
  buildViewModel(gameIndex: number, tick: number): BattleViewModel;
  deriveMarkers(gameIndex: number): TimelineMarker[];
}

/** The ground-zone order per side so both Fronts sit nearest the contact line (§4, collapse-forward). */
const PLAYER_GROUND: GroundZoneView['zone'][] = ['Rear', 'Middle', 'Front'];
const ENEMY_GROUND: GroundZoneView['zone'][] = ['Front', 'Middle', 'Rear'];

/** `HeavyTank` → `Heavy Tank` (spaced) for accessible marker labels. */
function humanizeType(typeId: string): string {
  return typeId.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/**
 * Build the pure, engine-free view over a decoded replay. Throws {@link UnsupportedFormatError} (via
 * the reader's `formatVersion` gate) for an unrenderable replay — the caller renders the graceful
 * reject state (FR-003). `playerSide` decides which side tints friendly vs enemy.
 */
export function createReplayView(
  replay: WireReplay | ReplayReader,
  playerSide: Side,
): ReplayView {
  const reader = replay instanceof ReplayReader ? replay : parseReplay(replay);
  const unitOrder = reader.unitOrder;
  const markerCache = new Map<number, TimelineMarker[]>();

  const factionOf = (side: Side): Faction => (side === playerSide ? 'friendly' : 'enemy');

  function lastTick(gameIndex: number): number {
    return Math.max(0, reader.tickCount(gameIndex) - 1);
  }

  function unitMaxHull(gameIndex: number, column: number): number {
    return reader.snapshotAt(gameIndex, 0)[column]![0] / SCALE;
  }

  function unitMaxShield(gameIndex: number, column: number): number {
    return reader.snapshotAt(gameIndex, 0)[column]![1] / SCALE;
  }

  function unitViewAt(gameIndex: number, tick: number, column: number, row: SnapshotRow): UnitView {
    const unit = unitOrder[column]!;
    const [hullMilli, shieldMilli, zoneIdx, alive] = row;
    const maxHullMilli = reader.snapshotAt(gameIndex, 0)[column]![0];
    const maxShieldMilli = reader.snapshotAt(gameIndex, 0)[column]![1];
    return {
      column,
      instanceId: unit.instanceId,
      typeId: unit.typeId,
      variantId: unit.variantId,
      side: unit.side,
      faction: factionOf(unit.side),
      hull: hullMilli / SCALE,
      shield: shieldMilli / SCALE,
      hullPct: maxHullMilli > 0 ? Math.min(1, Math.max(0, hullMilli / maxHullMilli)) : 0,
      shieldPct: maxShieldMilli > 0 ? Math.min(1, Math.max(0, shieldMilli / maxShieldMilli)) : 0,
      hasShield: maxShieldMilli > 0,
      zone: ZONE_NAMES[zoneIdx] ?? 'Front',
      alive: alive !== 0,
    };
  }

  function sideView(units: UnitView[], order: GroundZoneView['zone'][]): SideView {
    const air = units.filter((u) => u.zone === 'Air');
    const ground = order.map((zone) => {
      const zoneUnits = units.filter((u) => u.zone === zone);
      return { zone, isEmpty: zoneUnits.length === 0, units: zoneUnits };
    });
    return { air, airEmpty: air.length === 0, ground };
  }

  function statsFor(mine: UnitView[], theirs: UnitView[], gameIndex: number): SideStats {
    const hull = Math.round(mine.reduce((sum, u) => sum + u.hull, 0));
    // Damage dealt = how much of the opponent's tick-0 hull total has been removed.
    const oppMax = theirs.reduce((sum, u) => sum + unitMaxHull(gameIndex, u.column), 0);
    const oppNow = theirs.reduce((sum, u) => sum + u.hull, 0);
    return {
      alive: mine.filter((u) => u.alive).length,
      total: mine.length,
      hull,
      damageDealt: Math.max(0, Math.round(oppMax - oppNow)),
    };
  }

  function buildViewModel(gameIndex: number, tick: number): BattleViewModel {
    const rows = reader.snapshotAt(gameIndex, tick);
    const units = rows.map((row, col) => unitViewAt(gameIndex, tick, col, row));
    const mine = units.filter((u) => u.faction === 'friendly');
    const theirs = units.filter((u) => u.faction === 'enemy');
    const last = lastTick(gameIndex);
    return {
      player: sideView(mine, PLAYER_GROUND),
      enemy: sideView(theirs, ENEMY_GROUND),
      stats: {
        player: statsFor(mine, theirs, gameIndex),
        enemy: statsFor(theirs, mine, gameIndex),
      },
      tick,
      lastTick: last,
      progress: last > 0 ? tick / last : 0,
    };
  }

  function deriveMarkers(gameIndex: number): TimelineMarker[] {
    const cached = markerCache.get(gameIndex);
    if (cached) return cached;

    const last = lastTick(gameIndex);
    const markers: TimelineMarker[] = [];
    const tickCount = reader.tickCount(gameIndex);
    for (let tick = 0; tick < tickCount; tick += 1) {
      for (const event of reader.eventsAt(gameIndex, tick)) {
        if (event.t !== 'death' && event.t !== 'planb') continue;
        const unit = unitOrder[event.u];
        if (!unit) continue;
        const name = humanizeType(unit.typeId);
        markers.push({
          tick,
          kind: event.t,
          side: factionOf(unit.side),
          unitInstanceId: unit.instanceId,
          label:
            event.t === 'death'
              ? `${name} down — tick ${tick}`
              : `Plan B triggered — ${name}, tick ${tick}`,
          position: last > 0 ? tick / last : 0,
        });
      }
    }
    markerCache.set(gameIndex, markers);
    return markers;
  }

  return {
    gamesCount: reader.gameCount,
    tickRate: reader.replay.meta.tickRate,
    unitOrder,
    lastTick,
    snapshotAt: (g, t) => reader.snapshotAt(g, t),
    eventsAt: (g, t) => reader.eventsAt(g, t),
    unitMaxHull,
    unitMaxShield,
    buildViewModel,
    deriveMarkers,
  };
}
