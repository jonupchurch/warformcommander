/**
 * Feature 12 — the advisory balance-report reader (US5, FR-019). It surfaces Feature 2's latest
 * committed report read-only, and its **absence never blocks editing** (returns null). Uses a temp
 * dir so the test doesn't depend on whether a report happens to be committed.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getLatestBalanceReport } from "@/server/balance-report";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function tempReportsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wfc-report-"));
  dirs.push(dir);
  return dir;
}

const FIXTURE = {
  reportVersion: 1,
  provenance: { rulesetHash: "deadbeef", engineVersion: "0.1.0", replayFormatVersion: 1 },
  runConfig: { baseSeed: "1", samplesPerMatchup: 1000, fairBand: { floor: 0.4, ceiling: 0.6 } },
  matchups: [{ label: "kinetic vs energy", winRateA: 0.52, samples: 1000, ci95: { low: 0.49, high: 0.55 } }],
  flagged: [
    {
      combo: { label: "air alpha" },
      acrossFieldWinRate: 0.71,
      ci95: { low: 0.66, high: 0.75 },
      kind: "Dominant",
      reason: "beats every non-AA archetype",
      severity: 0.11,
    },
  ],
  invariants: [
    { name: "FamilyBonusBand", band: { low: 0.1, high: 0.15 }, measured: 0.12, margin: 0.02, pass: true, evidence: [] },
  ],
  coverage: { candidatesEvaluated: 12, fieldSize: 6, totalResolutions: 72000, skippedInvalid: 0 },
};

describe("getLatestBalanceReport", () => {
  it("returns null when the directory has no report (advisory — editing stays available)", async () => {
    expect(await getLatestBalanceReport(await tempReportsDir())).toBeNull();
  });

  it("returns null when the directory does not exist", async () => {
    expect(await getLatestBalanceReport(join(tmpdir(), "wfc-no-such-reports-dir-zzz"))).toBeNull();
  });

  it("parses the newest committed report JSON", async () => {
    const dir = await tempReportsDir();
    await writeFile(join(dir, "report-2026-07-21.json"), JSON.stringify(FIXTURE), "utf8");

    const got = await getLatestBalanceReport(dir);
    expect(got).not.toBeNull();
    expect(got?.matchups[0].label).toBe("kinetic vs energy");
    expect(got?.flagged[0].kind).toBe("Dominant");
    expect(got?.invariants[0].pass).toBe(true);
    expect(got?.provenance.rulesetHash).toBe("deadbeef");
  });
});
