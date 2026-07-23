/**
 * Field metrics for the counter-web pass (spec 014) — the two diagnostic signals that distinguish a
 * CONTESTED field from a field of cycled walls, which the balancer's aggregate standings cannot show.
 *
 *   node scripts/field-metrics.js <path-to-balance-report.json>
 *
 * Reports, over the 132 directional matchups + 66 unordered pairs:
 *   walls        — matchups resolving ≤5% or ≥95% (a 0/100 sweep)
 *   contested    — matchups strictly between (SC-001)
 *   near-ties    — matchups at 40–60% (SC-002 — the signature that the total order is broken)
 *   monotone     — over unordered pairs, the fraction where the higher-ranked army wins (SC-003)
 *
 * Contract + baselines: specs/014-counter-web/contracts/ruleset-schema.md.
 */
const path = process.argv[2];
if (!path) {
  console.error("usage: node scripts/field-metrics.js <balance-report.json>");
  process.exit(2);
}
const report = require(require("path").resolve(path));
const ms = report.matchups;
if (!Array.isArray(ms)) {
  console.error("no matchups[] in report");
  process.exit(2);
}

// --- Per-matchup classification ---
let walls = 0, contested = 0, nearTies = 0;
const nearTieList = [];
for (const m of ms) {
  const wr = m.winRateA;
  if (wr <= 0.05 || wr >= 0.95) walls++;
  else contested++;
  if (wr >= 0.4 && wr <= 0.6) {
    nearTies++;
    nearTieList.push(`${m.label} = ${(wr * 100).toFixed(1)}%`);
  }
}

// --- Standings + monotone (total-order) rate over unordered pairs ---
const agg = {}; // label -> {wins, samples}
const dir = {}; // "A|B" -> winRateA
for (const m of ms) {
  const [a, b] = m.label.split(" vs ");
  dir[a + "|" + b] = m.winRateA;
  (agg[a] ??= { wins: 0, samples: 0 });
  (agg[b] ??= { wins: 0, samples: 0 });
  agg[a].wins += m.winsA; agg[a].samples += m.samples;
  agg[b].wins += m.winsB; agg[b].samples += m.samples;
}
const rank = Object.entries(agg)
  .map(([label, v]) => ({ label, rate: v.samples ? v.wins / v.samples : 0 }))
  .sort((x, y) => y.rate - x.rate);
let pairs = 0, upsets = 0;
for (let i = 0; i < rank.length; i++) {
  for (let j = i + 1; j < rank.length; j++) {
    const hi = rank[i].label, lo = rank[j].label;
    const hiAsA = dir[hi + "|" + lo], loAsA = dir[lo + "|" + hi];
    if (hiAsA === undefined || loAsA === undefined) continue;
    const hiWin = (hiAsA + (1 - loAsA)) / 2;
    pairs++;
    if (hiWin < 0.5) upsets++;
  }
}
const monotone = pairs ? (pairs - upsets) / pairs : 0;
const spread = rank.length ? (rank[0].rate - rank[rank.length - 1].rate) * 100 : 0;

const total = ms.length;
console.log(`field metrics — ${total} matchups, ${rank.length} archetypes`);
console.log(`  walls (0/100)   : ${walls}  (${(100 * walls / total).toFixed(1)}%)`);
console.log(`  contested 5–95% : ${contested}  (${(100 * contested / total).toFixed(1)}%)   [SC-001 ≥26]`);
console.log(`  near-ties 40–60%: ${nearTies}   [SC-002 ≥20, baseline 0]`);
console.log(`  monotone rate   : ${(100 * monotone).toFixed(1)}%   [SC-003 ≤75%, baseline 93.9%]`);
console.log(`  spread          : ${spread.toFixed(1)} pts`);
if (nearTieList.length) {
  console.log(`  near-ties:`);
  for (const n of nearTieList) console.log(`    - ${n}`);
}
