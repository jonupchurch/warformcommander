/**
 * Pure replay reader (Feature 1 / US5, T050) — the seek primitive the Battle Playback scrubber
 * (Feature 5) sits on. It parses the compact **wire replay** the engine emits
 * (`crates/engine/src/replay/format.rs`), gates the `formatVersion`, and indexes any tick in O(1).
 *
 * Contract: **no engine import, no re-simulation.** The reader validates once, then answers seeks by
 * array-indexing `snapshots[tick]` / `events[tick]`. Hull/shield are fixed-point **milli-units**
 * (divide by {@link SCALE} for display); zones are indices ({@link ZONE_NAMES}).
 *
 * This is the hand-kept TypeScript mirror of the Rust wire types — kept in sync as the shared
 * contract (data-model P8). If the Rust `WireReplay` changes shape, change this too.
 */

/** Milli-unit scale: a hull of `1700` serializes as `1_700_000`. Divide for display. */
export const SCALE = 1000;

/** Wire versions this reader understands (inclusive). Mirrors the Rust `SUPPORTED_FORMAT_VERSIONS`. */
export const SUPPORTED_FORMAT_VERSIONS = { min: 1, max: 1 } as const;

/** Snapshot zone indices → names (`0=Air, 1=Front, 2=Middle, 3=Rear`). */
export const ZONE_NAMES = ['Air', 'Front', 'Middle', 'Rear'] as const;
export type ZoneName = (typeof ZONE_NAMES)[number];

export type Side = 'A' | 'B';

export interface WireUnit {
  side: Side;
  instanceId: number;
  typeId: string;
  variantId: string;
}

/** Positional snapshot row: `[hull, shield, zoneIdx, alive]` (hull/shield in milli-units). */
export type SnapshotRow = [number, number, number, number];

export type WireEvent =
  | { t: 'shot'; a: number; d: number }
  | { t: 'hit'; a: number; d: number; dmg: number; layer: 'Shield' | 'Ablative' | 'Hull'; crit: boolean; splash: boolean }
  | { t: 'miss'; a: number; d: number }
  | { t: 'death'; u: number; k: number | null }
  | { t: 'move'; u: number; from: number; to: number }
  | { t: 'planb'; u: number; slot: 'Slot1' | 'Slot2'; dial: string }
  | {
      t: 'support';
      a: number;
      d: number;
      amt: number;
      kind: 'Heal' | 'ShieldBoost' | 'Aura' | 'Ablation';
    };

export interface WireGameResult {
  winner: Side | null;
  condition: 'Conquest' | 'Time';
  rewardTier: 'Full' | 'Lesser';
  durationTicks: number;
}

export interface WireGame {
  gameResult: WireGameResult;
  /** `snapshots[tick][col]` — `col` indexes `meta.unitOrder`. */
  snapshots: SnapshotRow[][];
  events: WireEvent[][];
}

export interface WireMeta {
  seed: string;
  rulesetHash: string;
  tickRate: number;
  tickCap: number;
  matchConfig: { adaptation: 'Locked' | 'Free'; defenderSide: Side; bestOf: number };
  unitOrder: WireUnit[];
  armies: unknown; // opaque here — the Garage owns the Army type
}

export interface WireReplay {
  formatVersion: number;
  meta: WireMeta;
  games: WireGame[];
  result: unknown; // MatchResult — opaque to the reader
}

/** A decoded, human-friendly frame for one unit at one tick. */
export interface UnitFrame {
  unit: WireUnit;
  hull: number; // whole units
  shield: number; // whole units
  zone: ZoneName;
  alive: boolean;
}

export class UnsupportedFormatError extends Error {
  constructor(public readonly version: number) {
    super(
      `replay formatVersion ${version} is not supported ` +
        `(this build reads ${SUPPORTED_FORMAT_VERSIONS.min}–${SUPPORTED_FORMAT_VERSIONS.max})`,
    );
    this.name = 'UnsupportedFormatError';
  }
}

/** Whether a wire version is renderable by this build. */
export function isSupported(version: number): boolean {
  return version >= SUPPORTED_FORMAT_VERSIONS.min && version <= SUPPORTED_FORMAT_VERSIONS.max;
}

/**
 * Parse + gate a wire replay. Throws {@link UnsupportedFormatError} for an out-of-range version and
 * `TypeError` for a structurally-invalid blob. Accepts a JSON string or an already-parsed object.
 */
export function parseReplay(input: string | unknown): ReplayReader {
  const raw: unknown = typeof input === 'string' ? JSON.parse(input) : input;
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('replay is not an object');
  }
  const replay = raw as WireReplay;
  if (typeof replay.formatVersion !== 'number') {
    throw new TypeError('replay is missing a numeric formatVersion');
  }
  if (!isSupported(replay.formatVersion)) {
    throw new UnsupportedFormatError(replay.formatVersion);
  }
  if (!Array.isArray(replay.games) || !replay.meta || !Array.isArray(replay.meta.unitOrder)) {
    throw new TypeError('replay is missing games or unitOrder');
  }
  return new ReplayReader(replay);
}

/**
 * The seek primitive: parse once, index forever. Every accessor is an O(1) array lookup — the
 * reader never reconstructs state from events and never touches the engine.
 */
export class ReplayReader {
  constructor(public readonly replay: WireReplay) {}

  get formatVersion(): number {
    return this.replay.formatVersion;
  }

  get unitOrder(): readonly WireUnit[] {
    return this.replay.meta.unitOrder;
  }

  get gameCount(): number {
    return this.replay.games.length;
  }

  /** Number of ticks in a game. */
  tickCount(game: number): number {
    return this.game(game).snapshots.length;
  }

  private game(game: number): WireGame {
    const g = this.replay.games[game];
    if (!g) throw new RangeError(`game ${game} out of range (0..${this.gameCount})`);
    return g;
  }

  /** The raw positional rows at a tick — O(1). Row `col` maps to {@link unitOrder}`[col]`. */
  snapshotAt(game: number, tick: number): SnapshotRow[] {
    const rows = this.game(game).snapshots[tick];
    if (!rows) throw new RangeError(`tick ${tick} out of range for game ${game}`);
    return rows;
  }

  /** The events resolved at a tick — O(1). */
  eventsAt(game: number, tick: number): WireEvent[] {
    return this.game(game).events[tick] ?? [];
  }

  /** One unit's raw row at a tick — O(1). */
  rowOf(game: number, tick: number, col: number): SnapshotRow {
    const row = this.snapshotAt(game, tick)[col];
    if (!row) throw new RangeError(`unit column ${col} out of range`);
    return row;
  }

  /** A decoded, display-ready frame for every unit at a tick. */
  frameAt(game: number, tick: number): UnitFrame[] {
    const rows = this.snapshotAt(game, tick);
    return rows.map((row, col) => decodeFrame(this.unitOrder[col]!, row));
  }
}

/** Decode a positional row into a display frame. */
export function decodeFrame(unit: WireUnit, row: SnapshotRow): UnitFrame {
  const [hull, shield, zoneIdx, alive] = row;
  return {
    unit,
    hull: hull / SCALE,
    shield: shield / SCALE,
    zone: ZONE_NAMES[zoneIdx] ?? 'Front',
    alive: alive !== 0,
  };
}
