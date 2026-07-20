import { test, expect } from "@playwright/test";

/**
 * US4 — the game's identity-carrying icons. All 7 machine types render as **inlined** SVGs (so
 * `currentColor` tints them, not an <img>), take the friendly/enemy faction color with no per-type
 * hardcode (SC-008), and expose an accessible name when meaningful / are hidden when decorative.
 */
test.describe("unit icons", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/gallery");
  });

  test("all 7 types render as inlined SVGs, faction-tinted via currentColor (SC-008)", async ({
    page,
  }) => {
    const friendly = page.getByTestId("unit-icons-friendly");
    const enemy = page.getByTestId("unit-icons-enemy");

    await expect(friendly.locator("svg")).toHaveCount(7);
    await expect(enemy.locator("svg")).toHaveCount(7);

    // Inlined (has child shapes), not an <img>.
    const childCount = await friendly.locator("svg").first().evaluate((s) => s.children.length);
    expect(childCount, "svg is inlined with shapes").toBeGreaterThan(0);

    // currentColor resolves to the faction token.
    const fColor = await friendly.locator("svg").first().evaluate((s) => getComputedStyle(s).color);
    expect(fColor, "friendly = cyan").toBe("rgb(42, 212, 255)");
    const eColor = await enemy.locator("svg").first().evaluate((s) => getComputedStyle(s).color);
    expect(eColor, "enemy = red").toBe("rgb(255, 59, 78)");
  });

  test("titled icons expose accessible names; decorative ones are hidden (AS5)", async ({ page }) => {
    await expect(page.getByRole("img", { name: "Heavy Tank" })).toBeVisible();
    // enemy row has no titles → all aria-hidden, not exposed to AT
    await expect(page.getByTestId("unit-icons-enemy").locator('svg[aria-hidden="true"]')).toHaveCount(7);
  });
});
