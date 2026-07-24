/**
 * Build script: generate `db/seed-test-bot-armies.json` — 36 unique, engine-valid v3 armies for the
 * test-bot roster (12 bots × 3 defense slots). Every army is a recombination of **proven-valid machine
 * blocks** drawn from `db/seed-armies.json`, and EACH candidate is gated through the real engine
 * `validateSquad()` before it is kept — so nothing the engine would reject is ever written.
 *
 * Invariants leaned on (all true of the 6 canonical armies): every army has 5 machines with **distinct
 * variantIds**, and each variant maps to exactly one zone. So recombining distinct variants across a
 * proven zone-multiset yields a legal army — and the validate() gate proves it.
 *
 * Deterministic: no randomness, fixed enumeration order ⇒ re-running reproduces the same file byte-for-byte.
 *
 *   tsx scripts/gen-test-bot-armies.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { configSignature } from "@/db/seed-helpers";
import type { MachineInstance, SquadConfig, ZoneId } from "@/sim/model";
import { validateSquad } from "@/sim/validate";
import seedArmies from "../db/seed-armies.json";

type Block = Omit<MachineInstance, "instanceId">;
interface OutArmy {
  name: string;
  blurb: string;
  config: SquadConfig;
}

const TARGET = 36;

// --- 1. Extract the proven machine-block palette, one per variant, grouped by zone ---------------
const blockByVariant = new Map<string, Block>();
const variantsByZone = new Map<ZoneId, string[]>();
for (const army of seedArmies as { config: SquadConfig }[]) {
  for (const m of army.config.machines) {
    if (blockByVariant.has(m.variantId)) continue;
    const { instanceId: _drop, ...block } = m;
    blockByVariant.set(m.variantId, block);
    const list = variantsByZone.get(m.zone) ?? [];
    list.push(m.variantId);
    variantsByZone.set(m.zone, list);
  }
}

// --- 2. Zone-multiset templates (each proven achievable by a canonical army) ---------------------
const TEMPLATES: { tag: string; blurb: string; zones: [ZoneId, number][] }[] = [
  { tag: "STEEL_LINE", blurb: "Combined line — armor wall, SAM screen, twin indirect.", zones: [["Front", 2], ["Middle", 1], ["Rear", 2]] },
  { tag: "SKY_CAVALRY", blurb: "Air cavalry — gunships aloft, a SAM, an anchor, support.", zones: [["Air", 2], ["Middle", 1], ["Front", 1], ["Rear", 1]] },
  { tag: "IRON_SPEAR", blurb: "Armored spearhead — three-wide front, SAM, an air flank.", zones: [["Front", 3], ["Middle", 1], ["Air", 1]] },
  { tag: "AEGIS_WALL", blurb: "Shield bastion — a front pair, a twin mid battery, one support.", zones: [["Front", 2], ["Middle", 2], ["Rear", 1]] },
];

// --- helpers ------------------------------------------------------------------------------------
function combinations<T>(arr: T[], k: number): T[][] {
  const res: T[][] = [];
  const rec = (start: number, combo: T[]) => {
    if (combo.length === k) return void res.push([...combo]);
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      rec(i + 1, combo);
      combo.pop();
    }
  };
  rec(0, []);
  return res;
}
function cartesian<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap((a) => list.map((x) => [...a, x])), [[]]);
}

// --- 3. Enumerate candidate armies per template (distinct variants, canonical order) -------------
function candidatesFor(zones: [ZoneId, number][]): SquadConfig[] {
  const perZone = zones.map(([zone, k]) => combinations(variantsByZone.get(zone) ?? [], k));
  return cartesian(perZone).map((pick) => {
    const variants = pick.flat(); // 5 variant ids across the army
    const machines: MachineInstance[] = variants.map((v, i) => ({ instanceId: i, ...blockByVariant.get(v)! }));
    return { machines };
  });
}
const pools = TEMPLATES.map((t) => ({ ...t, cands: candidatesFor(t.zones), cursor: 0, count: 0 }));

// --- 4. Round-robin across templates: validate + dedup until we have 36 --------------------------
const out: OutArmy[] = [];
const seen = new Set<string>();
let skipped = 0;
while (out.length < TARGET && pools.some((p) => p.cursor < p.cands.length)) {
  for (const p of pools) {
    if (out.length >= TARGET) break;
    if (p.cursor >= p.cands.length) continue;
    const config = p.cands[p.cursor++];
    const sig = configSignature(config);
    if (seen.has(sig)) continue;
    const v = validateSquad(config);
    if (!v.ok) {
      skipped++;
      continue;
    }
    seen.add(sig);
    p.count++;
    out.push({ name: `${p.tag}_${String(p.count).padStart(2, "0")}`, blurb: p.blurb, config });
  }
}

if (out.length < TARGET) {
  throw new Error(`only generated ${out.length}/${TARGET} valid unique armies (skipped ${skipped} invalid)`);
}

const outPath = join(process.cwd(), "db", "seed-test-bot-armies.json");
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${out.length} unique armies → ${outPath}`);
console.log(`per template: ${pools.map((p) => `${p.tag}=${p.count}`).join(", ")}`);
console.log(`validation skips: ${skipped}`);
process.exit(0);
