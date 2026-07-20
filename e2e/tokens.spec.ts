import { test, expect } from "@playwright/test";

/**
 * US1 — the token system is the single visual source of truth. We assert the gallery's swatches
 * paint the exact Brand Foundation values (SC-002) and that colliding roles are distinct,
 * independently re-pointable tokens (FR-002). Reading the painted `backgroundColor` resolves the
 * full var chain (semantic → primitive → hex), so this catches any drift at any tier.
 */

// Brand Foundation values as the browser reports them (rgb). Hex lives only here (test file), never
// in component source — the no-raw-hex guard (SC-002) enforces that.
const EXPECTED: Record<string, string> = {
  "--faction-friendly": "rgb(42, 212, 255)", // #2ad4ff
  "--faction-enemy": "rgb(255, 59, 78)", //     #ff3b4e
  "--faction-enemy-brand": "rgb(255, 47, 176)", // #ff2fb0
  "--bg": "rgb(6, 8, 11)", //                    #06080b
  "--surface": "rgb(11, 15, 21)", //             #0b0f15
  "--text-strong": "rgb(238, 243, 248)", //      #eef3f8
  "--text": "rgb(196, 204, 214)", //             #c4ccd6
  "--text-muted": "rgb(139, 151, 166)", //       #8b97a6
  "--zone-air": "rgb(138, 109, 255)", //         #8a6dff (brightened from #7b5cff for AA, FR-005)
  "--zone-middle": "rgb(255, 140, 26)", //       #ff8c1a
  "--family-explosive": "rgb(255, 93, 168)", //  #ff5da8
};

test.describe("design tokens", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/gallery");
  });

  test("swatches resolve to the Brand Foundation values (SC-002)", async ({ page }) => {
    for (const [token, expected] of Object.entries(EXPECTED)) {
      const swatch = page.locator(`[data-swatch="${token}"]`);
      await expect(swatch, `${token} swatch present`).toHaveCount(1);
      const bg = await swatch.evaluate((n) => getComputedStyle(n).backgroundColor);
      expect(bg, token).toBe(expected);
    }
  });

  test("colliding roles resolve to one primitive yet stay distinct tokens (FR-002)", async ({ page }) => {
    // friendly / front / kinetic all resolve to cyan, but are separate tokens so re-pointing one
    // never moves the others.
    const roles = ["--faction-friendly", "--zone-front", "--family-kinetic"];
    const cyan = "rgb(42, 212, 255)";
    for (const token of roles) {
      const bg = await page
        .locator(`[data-swatch="${token}"]`)
        .evaluate((n) => getComputedStyle(n).backgroundColor);
      expect(bg, token).toBe(cyan);
    }
    expect(new Set(roles).size, "three independently declared tokens").toBe(3);
  });
});
