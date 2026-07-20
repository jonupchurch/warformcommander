/**
 * US5 defense designation (T034 — the pure guard/staleness logic the panel renders). The three rules
 * the panel surfaces before the server enforces them (≤3 cap, attack/defense exclusivity, ≥1
 * attackable) and the **staleness** flag (a designated squad whose live config drifted from its frozen
 * snapshot ⇒ offer re-designate) are all pure functions of (roster, snapshots, currentId), so they are
 * unit-tested here. (The DB-level immutability guarantee — `updateSquad` never mutates an active
 * snapshot row — is a Feature 7 transactional concern, covered by its own suite / e2e.)
 */

import { describe, expect, it } from 'vitest';

import {
  computeDefenseView,
  type DefenseSnapshotLike,
  type RosterSquadLike,
} from '@/lib/garage/defense-view';
import type { SquadConfig } from '@/sim/model';

/** A distinguishable config (only the JSON matters to the staleness compare). */
function cfg(tag: string): SquadConfig {
  return { machines: [{ tag }] } as unknown as SquadConfig;
}

function squad(over: Partial<RosterSquadLike> & { id: string }): RosterSquadLike {
  return {
    name: over.id,
    powerRating: 100,
    defenseSlot: null,
    config: cfg(over.id),
    ...over,
  };
}

describe('slot occupancy + cap (≤3)', () => {
  it('maps designated squads into their slots and reports free slots', () => {
    const roster = [
      squad({ id: 'a', defenseSlot: 0 }),
      squad({ id: 'b', defenseSlot: 2 }),
      squad({ id: 'c' }), // attackable
    ];
    const v = computeDefenseView(roster, [], null);
    expect(v.usedCount).toBe(2);
    expect(v.freeSlots).toEqual([1]);
    expect(v.slots[0]).toMatchObject({ slot: 0, squadId: 'a' });
    expect(v.slots[1]).toMatchObject({ slot: 1, squadId: null });
    expect(v.slots[2]).toMatchObject({ slot: 2, squadId: 'b' });
  });
});

describe('attack/defense exclusivity count', () => {
  it('attackableCount counts only non-designated squads', () => {
    const roster = [
      squad({ id: 'a', defenseSlot: 0 }),
      squad({ id: 'b' }),
      squad({ id: 'c' }),
    ];
    expect(computeDefenseView(roster, [], null).attackableCount).toBe(2);
  });
});

describe('current-squad designate guards', () => {
  it('an unsaved squad cannot be designated (save first)', () => {
    const v = computeDefenseView([squad({ id: 'a' }), squad({ id: 'b' })], [], null);
    expect(v.current.saved).toBe(false);
    expect(v.current.canDesignate).toBe(false);
    expect(v.current.blockReason).toMatch(/save/i);
  });

  it('a saved, non-designated squad with a free slot and a spare attackable can designate', () => {
    const roster = [squad({ id: 'a' }), squad({ id: 'b' })];
    const v = computeDefenseView(roster, [], 'a');
    expect(v.current.canDesignate).toBe(true);
    expect(v.current.blockReason).toBeNull();
  });

  it('blocks when all 3 slots are full', () => {
    const roster = [
      squad({ id: 'a', defenseSlot: 0 }),
      squad({ id: 'b', defenseSlot: 1 }),
      squad({ id: 'c', defenseSlot: 2 }),
      squad({ id: 'd' }), // the current, attackable
    ];
    const v = computeDefenseView(roster, [], 'd');
    expect(v.current.canDesignate).toBe(false);
    expect(v.current.blockReason).toMatch(/full/i);
  });

  it('blocks designating the last attackable squad (≥1-attackable)', () => {
    const roster = [
      squad({ id: 'a', defenseSlot: 0 }),
      squad({ id: 'b' }), // the only attackable one — and it's the current
    ];
    const v = computeDefenseView(roster, [], 'b');
    expect(v.attackableCount).toBe(1);
    expect(v.current.canDesignate).toBe(false);
    expect(v.current.blockReason).toMatch(/attackable/i);
  });
});

describe('staleness of a designated squad', () => {
  const roster = [
    squad({ id: 'a', defenseSlot: 0, config: cfg('EDITED') }),
    squad({ id: 'b' }),
  ];

  it('is stale when the live config drifts from the active snapshot', () => {
    const snaps: DefenseSnapshotLike[] = [
      { sourceSquadId: 'a', defenseSlot: 0, config: cfg('ORIGINAL') },
    ];
    const v = computeDefenseView(roster, snaps, 'a');
    expect(v.current.designated).toBe(true);
    expect(v.current.isStale).toBe(true);
    expect(v.current.blockReason).toBeNull(); // designated → panel shows re-designate/undesignate
  });

  it('is not stale when the snapshot matches the live config', () => {
    const snaps: DefenseSnapshotLike[] = [
      { sourceSquadId: 'a', defenseSlot: 0, config: cfg('EDITED') },
    ];
    expect(computeDefenseView(roster, snaps, 'a').current.isStale).toBe(false);
  });
});
