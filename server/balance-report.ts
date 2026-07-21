/**
 * `getLatestBalanceReport()` (Feature 12, US5) — reads the newest committed BalanceReport JSON that
 * Feature 2's balancer emits under `balance-reports/`, so the admin can view **proven** imbalance
 * (matchups, severity-sorted flags, the four invariants with measured numbers/margins) before tuning.
 * Read-only and advisory — this feature never runs the balancer or mutates a report, and its absence
 * never blocks editing (returns `null`, FR-019). Server-only (filesystem).
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** The BalanceReport wire shape (Feature 2 `report/model.rs`, camelCase). Only the rendered fields are typed. */
export interface BalanceReport {
  reportVersion: number;
  provenance: { rulesetHash: string; engineVersion: string; replayFormatVersion: number; generatedAt?: string };
  runConfig: { baseSeed: string; samplesPerMatchup: number; fairBand: { floor: number; ceiling: number } };
  matchups: Array<{ label: string; winRateA: number; samples: number; ci95: { low: number; high: number } }>;
  flagged: Array<{
    combo: { label: string };
    acrossFieldWinRate: number;
    ci95: { low: number; high: number };
    kind: string;
    reason: string;
    severity: number;
  }>;
  invariants: Array<{
    name: string;
    band: { low: number; high: number };
    measured: number;
    margin: number;
    pass: boolean;
    evidence: string[];
  }>;
  coverage: { candidatesEvaluated: number; fieldSize: number; totalResolutions: number; skippedInvalid: number };
}

const REPORTS_DIR = join(process.cwd(), "balance-reports");

/**
 * The newest committed report, or `null` when none exists yet (the panel states that; editing stays
 * available). `dir` is injectable for tests; production reads the repo's `balance-reports/`.
 */
export async function getLatestBalanceReport(dir: string = REPORTS_DIR): Promise<BalanceReport | null> {
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    if (files.length === 0) return null;
    const stamped = await Promise.all(
      files.map(async (f) => ({ f, mtimeMs: (await stat(join(dir, f))).mtimeMs })),
    );
    stamped.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const raw = await readFile(join(dir, stamped[0].f), "utf8");
    return JSON.parse(raw) as BalanceReport;
  } catch {
    return null; // no dir / unreadable / malformed — advisory only, never a gate
  }
}
