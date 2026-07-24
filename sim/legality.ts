/**
 * The **pure, browser-safe** army legality check — a faithful TypeScript port of the engine's
 * `validate` (`crates/engine/src/validate.rs`), applying rules **V1–V8** (data-model). The Garage
 * runs it at edit time for instant, reason-carrying feedback; the **server-side wasm `validate` is
 * the authority** (`sim/validate.ts`, Feature 7 A4) — this is convenience, kept in exact lockstep by
 * the parity fixture (`tests/fixtures/derive-battery.json`, Feature 4 T006, SC-001/SC-005, P8).
 *
 * It collects **every** violation (no short-circuit) in the engine's deterministic push order, each
 * with a machine-readable {@link ValidationCode} + the same human `reason` string — so a client and
 * the server agree not just on legality but on the exact messages surfaced.
 */

import { deriveEffectiveStats } from './derive';
import type { Army, MachineInstance } from './model';
import type { MountClass, Ruleset, SlotLayout } from './ruleset';

/** Zone caps (game rules, not tunable): ground rows hold 3, Air holds 2. */
export const MAX_PER_GROUND_ZONE = 3;
export const MAX_AIR = 2;
/** A battle is 5v5 (V1). */
export const SQUAD_SIZE = 5;

/** The machine-readable rule that rejected a build (`ValidationCode`, data-model V1–V8). */
export type ValidationCode =
  | 'SquadSize'
  | 'ZoneCap'
  | 'HomeZone'
  | 'MountMismatch'
  | 'Utilities'
  | 'PlanB'
  | 'DialGating'
  | 'Movement'
  | 'Structural';

/** A single rejection (mirror of the engine `ValidationError`). `instanceId` is `null` for army rules. */
export interface ValidationError {
  code: ValidationCode;
  reason: string;
  instanceId: number | null;
}

function armyError(code: ValidationCode, reason: string): ValidationError {
  return { code, reason, instanceId: null };
}
function machineError(code: ValidationCode, id: number, reason: string): ValidationError {
  return { code, reason, instanceId: id };
}

/** How many machines occupy each zone, in the engine's fixed order (Air, Front, Middle, Rear). */
function zoneCounts(army: Army): Array<[string, number]> {
  let air = 0;
  let front = 0;
  let middle = 0;
  let rear = 0;
  for (const m of army.machines) {
    if (m.zone === 'Air') air += 1;
    else if (m.zone === 'Front') front += 1;
    else if (m.zone === 'Middle') middle += 1;
    else if (m.zone === 'Rear') rear += 1;
  }
  return [
    ['Air', air],
    ['Front', front],
    ['Middle', middle],
    ['Rear', rear],
  ];
}

/**
 * Validate an army against the ruleset — returns **every** V1–V8 violation (empty array = legal),
 * in the engine's push order. The same verdict the wasm engine reaches (P8).
 */
export function validateArmy(army: Army, ruleset: Ruleset): ValidationError[] {
  const errors: ValidationError[] = [];

  // V1 — squad size.
  if (army.machines.length !== SQUAD_SIZE) {
    errors.push(
      armyError(
        'SquadSize',
        `squad has ${army.machines.length} machines; exactly ${SQUAD_SIZE} are required`,
      ),
    );
  }

  // V2 — zone caps.
  for (const [zone, count] of zoneCounts(army)) {
    const cap = zone === 'Air' ? MAX_AIR : MAX_PER_GROUND_ZONE;
    if (count > cap) {
      errors.push(armyError('ZoneCap', `${count} machines in ${zone} exceeds the cap of ${cap}`));
    }
  }

  // V3–V8 — per machine. A living-Commander army grants every machine a survival-gated bonus Plan-B
  // slot (US5): allowed at declaration here, gated to Commander-survival at runtime (behavior.rs).
  const hasCommander = army.machines.some((m) => m.typeId === 'Commander');
  for (const m of army.machines) {
    validateMachine(m, ruleset, hasCommander, errors);
  }

  return errors;
}

function validateMachine(
  m: MachineInstance,
  ruleset: Ruleset,
  armyHasCommander: boolean,
  errors: ValidationError[],
): void {
  const id = m.instanceId;
  const mtype = ruleset.machineTypes[m.typeId];
  if (!mtype) {
    errors.push(machineError('Structural', id, `unknown machine type ${m.typeId}`));
    return;
  }

  // V3 — home-zone eligibility.
  if (!mtype.homeZones.includes(m.zone)) {
    errors.push(machineError('HomeZone', id, `${m.typeId} may not start in ${m.zone}`));
  }

  // V4 — weapon + defense mount class must match the machine's mount.
  checkMount(ruleset, m.loadout.weapon, mtype.mountClass, 'weapon', id, errors);
  checkMount(ruleset, m.loadout.defense, mtype.mountClass, 'defense', id, errors);

  // V5 — utility count + no duplicates.
  const slots = variantSlotLayout(m, ruleset) ?? mtype.slotLayout;
  validateUtilities(m, slots, ruleset, errors);

  // Capability-dependent rules (V6–V8) need the derived stats.
  const derived = deriveEffectiveStats(m, ruleset);
  if (!derived.ok) {
    errors.push(machineError('Structural', id, JSON.stringify(derived.error)));
    return;
  }
  const stats = derived.stats;

  // V6 — Plan-B count + Slot-2 gating. A friendly Commander in the roster grants a survival-gated bonus
  // slot (US5), allowed at declaration and capped at the two real slots; it fires only while the
  // Commander lives (runtime gate in behavior.rs). Combat AI still grants its own 2nd slot.
  const effectiveSlots = Math.min(stats.planBSlots + (armyHasCommander ? 1 : 0), 2);
  if (m.planB.length > effectiveSlots) {
    errors.push(
      machineError(
        'PlanB',
        id,
        `${m.planB.length} Plan-B triggers exceed the ${effectiveSlots} available slots (Combat AI or a Commander grants a 2nd)`,
      ),
    );
  }
  if (effectiveSlots < 2 && m.planB.some((t) => t.slot === 'Slot2')) {
    errors.push(
      machineError(
        'PlanB',
        id,
        'a Slot-2 Plan-B trigger requires the Combat-AI capability or a friendly Commander',
      ),
    );
  }

  // V8 — movement order feasible for the machine's mobility.
  const moving = m.dials.movement !== 'Hold';
  const immobile = stats.moveSpeed === null || stats.moveSpeed === 0;
  if (moving && immobile) {
    errors.push(
      machineError(
        'Movement',
        id,
        'an immobile / air-locked machine cannot take a movement order',
      ),
    );
  }
}

function checkMount(
  ruleset: Ruleset,
  equip: string,
  mount: MountClass,
  slot: string,
  id: number,
  errors: ValidationError[],
): void {
  const equipModule = ruleset.equipment[equip];
  if (!equipModule) {
    errors.push(machineError('Structural', id, `unknown ${slot} '${equip}'`));
    return;
  }
  // Utilities are ungated (no mount) → a utility in a weapon/defense slot is a mismatch.
  const equipMount: MountClass | null =
    equipModule.kind === 'Utility' ? null : equipModule.mountClass;
  if (equipMount === null) {
    errors.push(
      machineError('MountMismatch', id, `${slot} slot holds a non-${slot} module '${equip}'`),
    );
  } else if (equipMount !== mount) {
    errors.push(
      machineError(
        'MountMismatch',
        id,
        `${slot} '${equip}' is ${equipMount}-mount, machine is ${mount}`,
      ),
    );
  }
}

function validateUtilities(
  m: MachineInstance,
  slots: SlotLayout,
  ruleset: Ruleset,
  errors: ValidationError[],
): void {
  const id = m.instanceId;
  const utils = m.loadout.utilities;
  // v3 US3-A economy: sum each utility's slot cost (default 1); legal while it does not exceed the
  // chassis's utility budget (`slots.utility`). Under-spending is allowed. Mirrors validate.rs.
  let spent = 0;
  for (const u of utils) {
    const mod = ruleset.equipment[u];
    if (mod && mod.kind === 'Utility') spent += mod.cost ?? 1;
  }
  if (spent > slots.utility) {
    errors.push(
      machineError(
        'Utilities',
        id,
        `utilities cost ${spent} of a ${slots.utility}-point utility budget`,
      ),
    );
  }
  // No duplicates (ordered scan → deterministic).
  for (let i = 0; i < utils.length; i++) {
    for (let j = i + 1; j < utils.length; j++) {
      if (utils[i] === utils[j]) {
        errors.push(machineError('Utilities', id, `duplicate utility '${utils[i]}'`));
      }
    }
  }
  // Each utility must exist and be a Utility.
  for (const u of utils) {
    const utilModule = ruleset.equipment[u];
    if (!utilModule) {
      errors.push(machineError('Structural', id, `unknown utility '${u}'`));
    } else if (utilModule.kind !== 'Utility') {
      errors.push(machineError('Utilities', id, `'${u}' is not a utility module`));
    }
  }
}

/** The variant's slot-layout override, if any (else the caller falls back to the type default). */
function variantSlotLayout(m: MachineInstance, ruleset: Ruleset): SlotLayout | undefined {
  return ruleset.chassis[m.variantId]?.slotLayoutOverride;
}
