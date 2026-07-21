/**
 * Feature 8 transient service DTOs (T006) — the shapes matchmaking/arena/practice pass around. This
 * feature persists nothing new (P8); these live only in memory for one request.
 *
 * The trust boundary is **structural, not conventional** (P6, US5): the client-facing request types
 * carry ONLY the caller's own choices — no userId, opponent, seed, ruleset, or outcome field exists,
 * so a forged field has nothing to overwrite. The fogged {@link MatchTicketPreview} is likewise a
 * fresh object built from an allow-list of safe fields — it never spreads a snapshot's config, so a
 * defender's behavior dials / Plan-B triggers **cannot** leak into a pre-battle response (FR-007).
 */

import { deriveEffectiveStats } from '@/sim/derive';
import type { Ruleset, SquadConfig } from '@/sim/model';

// --- Client-supplied inputs (the ONLY fields the resolve routes read) ---------------------------

/** The only body `POST /api/arena/resolve` reads. No opponent/seed/ruleset/outcome field (P6). */
export interface RankedMatchRequest {
  attackSquadId: string;
  ticketSnapshotId: string;
}

/**
 * The only body `POST /api/practice/resolve` reads. Practice tests one of the player's OWN squads
 * against a drawn opponent — both are legitimate no-stakes player choices (practice moves no standing,
 * so the ranked "opponent must be server-decided" rule doesn't apply). Still no seed/ruleset/outcome
 * field exists — the outcome is always server-computed (P6).
 */
export interface PracticeMatchRequest {
  attackSquadId: string;
  opponentSquadId: string;
}

// --- Server-only DTOs ---------------------------------------------------------------------------

export type PoolSource = 'real' | 'bot';

/** The server-side ranked selection. `servedConfig` is the full defender army — server-only, never
 *  serialized to the client as-is; only the fogged preview reaches the browser (US3). */
export interface MatchmakingSelection {
  defenderUserId: string;
  /** The defender commander's display handle (identity, not behavior — safe to show; US3 blinds only
   *  the behavior config). Falls back to a stable id-derived label when a handle is somehow absent. */
  defenderHandle: string;
  defenderSnapshotId: string;
  poolSource: PoolSource;
  servedConfig: SquadConfig;
}

/** One machine as the attacker may see it pre-battle — placement + identity only, never hidden logic. */
export interface PreviewMachine {
  typeId: string;
  variantId: string;
  zone: string;
}

/** The fogged pre-battle projection: composition + placement + power + derived tags. Deliberately has
 *  NO field for behavior dials, Plan-B triggers, or loadout internals (FR-007/SC-006). */
export interface MatchTicketPreview {
  composition: PreviewMachine[];
  power: number;
  damageFamilyTags: string[];
}

/** The opaque handle preview returns and deploy consumes — binds the served snapshot BY ID (FR-008). */
export interface MatchTicket {
  defenderSnapshotId: string;
  /** The defender commander's display handle. Identity only — the board itself stays behavior-blind
   *  (the fog is in {@link MatchTicketPreview}); Ranked reveals *who* you face, not *how* they fight. */
  defenderHandle: string;
  preview: MatchTicketPreview;
}

/** A practice opponent draw — a random squad with owner/identity stripped (FR-014). */
export interface PracticeDraw {
  opponentSquadId: string;
  opponentConfig: SquadConfig;
}

// --- The fog projection (the allow-list mapper — US3/T031) ---------------------------------------

/**
 * Project a served defender config to the fogged {@link MatchTicketPreview}. Reads ONLY `typeId`,
 * `variantId`, `zone` per machine, and derives each machine's damage `family` for tags — it never
 * reads or copies `dials`/`planB`/`loadout`, so those cannot reach the client (FR-007). Building a
 * fresh object (not a spread/clone) is what makes the blind guarantee structural.
 */
export function fogPreview(config: SquadConfig, ruleset: Ruleset, power: number): MatchTicketPreview {
  const composition: PreviewMachine[] = config.machines.map((m) => ({
    typeId: m.typeId,
    variantId: m.variantId,
    zone: m.zone,
  }));

  const families = new Set<string>();
  for (const machine of config.machines) {
    const derived = deriveEffectiveStats(machine, ruleset);
    if (derived.ok) families.add(derived.stats.family);
  }

  return { composition, power, damageFamilyTags: [...families].sort() };
}
