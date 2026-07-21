/**
 * `diffRuleset(prev, next)` + renderers (Feature 12, FR-016). A deep, leaf-level comparison of the
 * previous vs. the newly-saved `Ruleset`, producing one entry per changed leaf path (old → new, with
 * a percent delta for numeric leaves). `saveRuleset` uses the entry count to short-circuit a no-op
 * save (empty diff ⇒ no revision, no post — FR-015) and stores the structured diff in the balance
 * post's `metadata`; the renderers produce the human-readable body + excerpt readers see on the News
 * feed (Feature 11).
 *
 * Hand-rolled (no dependency): the `Ruleset` is a finite, acyclic tree of numbers/strings/enums/small
 * id-keyed maps, so a recursive walk is exact and cheap. Arrays (e.g. `homeZones`) are compared as
 * whole leaves — a legible "the list changed", not a noisy per-index diff.
 */

import type { Ruleset } from "@/sim/ruleset";

export interface RulesetDiffEntry {
  /** Dotted leaf path, e.g. `variants.Grizzly.hull`. */
  path: string;
  oldValue: unknown;
  newValue: unknown;
  /** For numeric leaves with a non-zero previous value: `(new − old) / |old|`. */
  percentDelta?: number;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Two leaves are equal iff structurally equal (arrays/primitives compared by value). */
function leafEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

function walk(path: string, a: unknown, b: unknown, out: RulesetDiffEntry[]): void {
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      walk(path ? `${path}.${key}` : key, a[key], b[key], out);
    }
    return;
  }
  if (leafEqual(a, b)) return;

  const entry: RulesetDiffEntry = { path, oldValue: a, newValue: b };
  if (typeof a === "number" && typeof b === "number" && a !== 0) {
    entry.percentDelta = (b - a) / Math.abs(a);
  }
  out.push(entry);
}

/** Every changed leaf between two rulesets (order: a stable depth-first walk). */
export function diffRuleset(prev: Ruleset, next: Ruleset): RulesetDiffEntry[] {
  const out: RulesetDiffEntry[] = [];
  walk("", prev, next, out);
  return out;
}

/** `−10%` / `+17%` for a fractional delta; `""` when there is none. */
function formatPercent(delta: number | undefined): string {
  if (delta === undefined) return "";
  const pct = delta * 100;
  const rounded = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return ` (${sign}${Math.abs(rounded)}%)`;
}

function formatValue(v: unknown): string {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v;
  if (v === undefined) return "—";
  return JSON.stringify(v);
}

function renderEntry(e: RulesetDiffEntry): string {
  return `${formatValue(e.oldValue)} → ${formatValue(e.newValue)}${formatPercent(e.percentDelta)}`;
}

/** The markdown body of a balance post — one bullet per changed leaf. */
export function renderDiffSummary(diff: RulesetDiffEntry[]): string {
  if (diff.length === 0) return "_No changes._";
  const lines = diff.map((e) => `- \`${e.path}\`: ${renderEntry(e)}`);
  return lines.join("\n");
}

/** A one-line excerpt — the first few changes, comma-joined, elided if longer. */
export function renderDiffOneLiner(diff: RulesetDiffEntry[], max = 3): string {
  if (diff.length === 0) return "No changes";
  const head = diff.slice(0, max).map((e) => `${e.path} ${renderEntry(e)}`);
  const more = diff.length - max;
  return more > 0 ? `${head.join(", ")}, +${more} more` : head.join(", ");
}
