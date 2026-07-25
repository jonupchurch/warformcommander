/**
 * Weekly-season boundary math for the automated bot ladder. Pure — the reset trigger is the subtle,
 * off-by-one-prone part, so it's pinned here in isolation (no DB/wasm). Boundaries are constructed from
 * the module's own Monday anchor, so the test never has to know a calendar weekday.
 */

import { describe, it, expect } from "vitest";

import { seasonIdFor, isNewSeason, seasonStartMs, SEASON_ANCHOR, WEEK_MS } from "@/server/season";

describe("weekly seasons", () => {
  it("anchors season 0 at the Monday epoch and counts whole weeks", () => {
    expect(seasonIdFor(SEASON_ANCHOR)).toBe(0);
    expect(seasonIdFor(SEASON_ANCHOR + 5 * WEEK_MS)).toBe(5);
  });

  it("increments exactly at each Monday 00:00 UTC boundary", () => {
    const boundary = SEASON_ANCHOR + 130 * WEEK_MS; // some Monday 00:00 UTC
    expect(seasonIdFor(boundary)).toBe(130);
    expect(seasonIdFor(boundary - 1)).toBe(129); // one ms before → prior season
    expect(seasonIdFor(boundary + WEEK_MS - 1)).toBe(130); // last ms of the week → same season
  });

  it("round-trips seasonStartMs", () => {
    const start = seasonStartMs(130);
    expect(start).toBe(SEASON_ANCHOR + 130 * WEEK_MS);
    expect(seasonIdFor(start)).toBe(130);
  });

  it("resets only when the last ranked match is in an earlier season", () => {
    const now = SEASON_ANCHOR + 130 * WEEK_MS + 4 * 60 * 60 * 1000; // Monday of season 130, 04:00
    expect(isNewSeason(now - WEEK_MS, now)).toBe(true); // last match a week ago → prior season → reset
    expect(isNewSeason(now - 60 * 60 * 1000, now)).toBe(false); // an hour ago → same season → no reset
    expect(isNewSeason(null, now)).toBe(false); // first run ever → never a reset
  });
});
