/**
 * Pure helpers for the admin ruleset editor (Feature 12, US1). The editor tunes the balance table's
 * **numeric leaves** — every number in the `Ruleset` (globals, cadence tiers, air mods, the damage
 * matrix, and each variant's base stats) — while leaving structural identity (ids, enums, zone lists)
 * intact. Client-safe (no wasm, no DB): the flattened leaves drive the inputs; `applyEdits` rebuilds
 * the full ruleset the Server Action validates + saves.
 */

import type { Ruleset } from "@/sim/ruleset";

export interface NumericLeaf {
  /** Dotted path, e.g. `variants.Grizzly.hull`. */
  path: string;
  value: number;
}

/** A display grouping of leaves: a top-level section, optionally split by an id-keyed subsection. */
export interface LeafGroup {
  /** The top-level ruleset key, e.g. `globals`, `variants`. */
  section: string;
  /** The id within an id-keyed section (e.g. a variant id), or `null` for a flat section. */
  subsection: string | null;
  leaves: NumericLeaf[];
}

/** The top-level groups the editor exposes, in display order (the base-stats / balance table). */
const EDITABLE_SECTIONS = ["globals", "cadenceTicks", "airMods", "damageMatrix", "variants"] as const;

/** Every numeric leaf under `obj`, as dotted paths. Arrays are treated as opaque (not descended). */
export function collectNumericLeaves(obj: unknown, prefix = ""): NumericLeaf[] {
  if (typeof obj === "number" && Number.isFinite(obj)) return [{ path: prefix, value: obj }];
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    return Object.entries(obj).flatMap(([k, v]) => collectNumericLeaves(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

/** The editor's grouped view: the editable sections, split into id-keyed subsections where relevant. */
export function groupEditableLeaves(ruleset: Ruleset): LeafGroup[] {
  const groups: LeafGroup[] = [];
  for (const section of EDITABLE_SECTIONS) {
    const value = (ruleset as unknown as Record<string, unknown>)[section];
    if (!value || typeof value !== "object") continue;
    const leaves = collectNumericLeaves(value, section);
    if (leaves.length === 0) continue;

    // Split an id-keyed section (variants) into one subgroup per id; keep flat sections whole.
    const bySub = new Map<string | null, NumericLeaf[]>();
    for (const leaf of leaves) {
      const parts = leaf.path.split(".");
      const sub = section === "variants" ? (parts[1] ?? null) : null;
      const list = bySub.get(sub) ?? [];
      list.push(leaf);
      bySub.set(sub, list);
    }
    for (const [subsection, subLeaves] of bySub) {
      groups.push({ section, subsection, leaves: subLeaves });
    }
  }
  return groups;
}

/** Immutably set a dotted-path numeric leaf on a clone of `base`. */
export function setByPath(base: Ruleset, path: string, value: number): Ruleset {
  const next = structuredClone(base);
  const parts = path.split(".");
  let node = next as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i += 1) {
    node = node[parts[i]] as Record<string, unknown>;
    if (!node) return next; // path no longer resolves — ignore
  }
  node[parts[parts.length - 1]] = value;
  return next;
}

/** Apply a map of `path → value` edits onto a clone of `base`, returning the full edited ruleset. */
export function applyEdits(base: Ruleset, edits: Record<string, number>): Ruleset {
  let next = base;
  for (const [path, value] of Object.entries(edits)) next = setByPath(next, path, value);
  return next;
}

/** How many edits actually differ from the base value (drives the "N changes" affordance). */
export function changedCount(base: Ruleset, edits: Record<string, number>): number {
  const byPath = new Map(collectNumericLeaves(base).map((l) => [l.path, l.value]));
  let n = 0;
  for (const [path, value] of Object.entries(edits)) {
    if (byPath.get(path) !== value) n += 1;
  }
  return n;
}

/** A short human label for a leaf within its group (the trailing path segment(s)). */
export function leafLabel(path: string, section: string, subsection: string | null): string {
  const prefix = subsection ? `${section}.${subsection}.` : `${section}.`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
