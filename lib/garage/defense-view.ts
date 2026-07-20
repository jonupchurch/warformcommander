/**
 * The defense-designation view-model (T035, US5) — the **pure** projection the `defense-panel` renders
 * from the roster + the actor's active snapshots. It surfaces the three rules a player must understand
 * *before* the server (Feature 7) enforces them (Principle II — this is convenience, the transactional
 * service is authority):
 *
 * - **≤3 cap** — only three defense slots exist (`freeSlots`), mirroring the DB's structural cap.
 * - **attack/defense exclusivity** — a designated squad leaves the attack pool (`attackableCount`
 *   counts only non-designated squads, per Feature 7 `listAttackable`).
 * - **≥1-attackable** — you may not designate your *last* attackable squad (`wouldOrphanAttack`), so
 *   there is always a squad to attack with.
 *
 * It also flags a **stale** designated squad — whose live config has drifted from its frozen snapshot
 * — so the panel can offer "re-designate to push live" (the snapshot is never mutated in place, AS3).
 */

import type { SquadConfig } from '@/sim/model';

/** The three base-defense slots (mirrors the server `MAX_DEFENSE_SLOTS`, a DB structural cap). */
export const DEFENSE_SLOT_COUNT = 3;

/** The roster fields this view needs (a structural subset of a Feature 7 `Squad`). */
export interface RosterSquadLike {
  id: string;
  name: string;
  powerRating: number;
  defenseSlot: number | null;
  config: SquadConfig;
}

/** The snapshot fields this view needs (a structural subset of a Feature 7 `DefenseSnapshot`). */
export interface DefenseSnapshotLike {
  /** Null once the source squad is deleted; the retained snapshot then matches no live squad. */
  sourceSquadId: string | null;
  defenseSlot: number;
  config: SquadConfig;
}

/** One defense slot's occupancy (empty ⇒ all-null). */
export interface DefenseSlotView {
  slot: number;
  squadId: string | null;
  name: string | null;
  powerRating: number | null;
}

/** The current (saved) squad's designation state + whether designate is allowed and why not. */
export interface CurrentDefenseView {
  saved: boolean;
  designated: boolean;
  slot: number | null;
  /** The live config has drifted from the active snapshot ⇒ re-designate to push it live. */
  isStale: boolean;
  canDesignate: boolean;
  /** Why designate is unavailable (null when it is available). */
  blockReason: string | null;
}

export interface DefenseView {
  slots: DefenseSlotView[];
  usedCount: number;
  freeSlots: number[];
  attackableCount: number;
  current: CurrentDefenseView;
}

/** Compute the panel view-model. `currentSquadId` is the editor's `editingSquadId` (null if unsaved). */
export function computeDefenseView(
  roster: readonly RosterSquadLike[],
  defense: readonly DefenseSnapshotLike[],
  currentSquadId: string | null,
): DefenseView {
  const slots: DefenseSlotView[] = [];
  for (let slot = 0; slot < DEFENSE_SLOT_COUNT; slot += 1) {
    const occupant = roster.find((s) => s.defenseSlot === slot) ?? null;
    slots.push({
      slot,
      squadId: occupant?.id ?? null,
      name: occupant?.name ?? null,
      powerRating: occupant?.powerRating ?? null,
    });
  }
  const usedCount = slots.filter((s) => s.squadId !== null).length;
  const freeSlots = slots.filter((s) => s.squadId === null).map((s) => s.slot);
  const attackableCount = roster.filter((s) => s.defenseSlot === null).length;

  const currentSquad = currentSquadId === null ? null : roster.find((s) => s.id === currentSquadId) ?? null;
  const saved = currentSquad !== null;
  const designated = saved && currentSquad.defenseSlot !== null;

  // Stale ⇒ the frozen snapshot no longer matches the squad's live config (a byte compare of the
  // stored JSON — the snapshot row is immutable, so drift means the squad was edited since designation).
  let isStale = false;
  if (designated) {
    const snap = defense.find((d) => d.sourceSquadId === currentSquad.id);
    isStale = snap !== undefined && JSON.stringify(snap.config) !== JSON.stringify(currentSquad.config);
  }

  // Designating the current squad removes it from the attack pool; block if it's the last attackable one.
  const wouldOrphanAttack = saved && !designated && attackableCount <= 1;

  let blockReason: string | null = null;
  if (!saved) {
    blockReason = 'Save this squad before designating it for defense.';
  } else if (designated) {
    blockReason = null; // already designated — the panel shows undesignate / re-designate instead
  } else if (freeSlots.length === 0) {
    blockReason = 'All 3 defense slots are full — undesignate one first.';
  } else if (wouldOrphanAttack) {
    blockReason = 'This is your only attackable squad — keep at least one to attack with.';
  }

  const canDesignate = saved && !designated && freeSlots.length > 0 && !wouldOrphanAttack;

  return {
    slots,
    usedCount,
    freeSlots,
    attackableCount,
    current: { saved, designated, slot: currentSquad?.defenseSlot ?? null, isStale, canDesignate, blockReason },
  };
}
