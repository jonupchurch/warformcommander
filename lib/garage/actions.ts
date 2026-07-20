'use server';

/**
 * Garage **Server Actions** (Feature 4 → Feature 7). The trust boundary: each resolves the session
 * at the server (`requireSession`, A1) and delegates to the Feature 7 service — the Garage holds no
 * DB access and no client-supplied actor (Principle II, P6). The service re-runs the authoritative
 * `validate()` before any write (A4), so a config the client thinks is legal is still re-checked here.
 *
 * On success we `revalidatePath('/garage')` so the roster rail reflects the write ([stacks/nextjs.md]).
 * Auth failures become a typed `FORBIDDEN` result rather than an unhandled throw.
 */

import { revalidatePath } from 'next/cache';

import { AuthError, type SessionUser } from '@/server/authz';
import {
  designateDefense,
  redesignateDefense,
  undesignateDefense,
  type DefenseSnapshot,
} from '@/server/defense';
import { savePreset, type Preset } from '@/server/presets';
import { err, type Result } from '@/server/result';
import { requireSession } from '@/server/session';
import { deleteSquad, saveSquad, updateSquad, type Squad } from '@/server/squads';
import type { PresetConfig, SquadConfig } from '@/sim/model';

const GARAGE_PATH = '/garage';

/** Resolve the session and run `fn` with the actor; an auth failure becomes a `FORBIDDEN` result. */
async function withActor<T>(fn: (actor: SessionUser) => Promise<Result<T>>): Promise<Result<T>> {
  try {
    const actor = await requireSession();
    return await fn(actor);
  } catch (e) {
    if (e instanceof AuthError) return err('FORBIDDEN', e.message);
    throw e;
  }
}

/** Save a new squad into a roster slot (server re-validates before write, A4). */
export async function saveSquadAction(input: {
  slotIndex: number;
  name: string;
  config: SquadConfig;
}): Promise<Result<Squad>> {
  const r = await withActor((actor) => saveSquad(actor, input));
  if (r.ok) revalidatePath(GARAGE_PATH);
  return r;
}

/** Rename / overwrite / move an existing squad (re-validated on a config change). */
export async function updateSquadAction(
  id: string,
  patch: { name?: string; config?: SquadConfig; slotIndex?: number },
): Promise<Result<Squad>> {
  const r = await withActor((actor) => updateSquad(actor, id, patch));
  if (r.ok) revalidatePath(GARAGE_PATH);
  return r;
}

/** Delete one of the actor's squads. */
export async function deleteSquadAction(id: string): Promise<Result<void>> {
  const r = await withActor((actor) => deleteSquad(actor, id));
  if (r.ok) revalidatePath(GARAGE_PATH);
  return r;
}

/** Designate a squad into a free defense slot (transactional; ≤3 cap enforced by the DB, A6). */
export async function designateDefenseAction(input: {
  squadId: string;
  slot: number;
}): Promise<Result<DefenseSnapshot>> {
  const r = await withActor((actor) => designateDefense(actor, input));
  if (r.ok) revalidatePath(GARAGE_PATH);
  return r;
}

/** Return a squad to the attack pool (soft-deactivates its snapshot, retained). */
export async function undesignateDefenseAction(squadId: string): Promise<Result<void>> {
  const r = await withActor((actor) => undesignateDefense(actor, squadId));
  if (r.ok) revalidatePath(GARAGE_PATH);
  return r;
}

/** Push an edited designated squad live: a fresh frozen snapshot at its current slot. */
export async function redesignateDefenseAction(squadId: string): Promise<Result<DefenseSnapshot>> {
  const r = await withActor((actor) => redesignateDefense(actor, squadId));
  if (r.ok) revalidatePath(GARAGE_PATH);
  return r;
}

/** Save a custom per-machine-type preset to the actor's library. */
export async function savePresetAction(input: {
  name: string;
  machineTypeId: string;
  config: PresetConfig;
}): Promise<Result<Preset>> {
  const r = await withActor((actor) => savePreset(actor, input));
  if (r.ok) revalidatePath(GARAGE_PATH);
  return r;
}
