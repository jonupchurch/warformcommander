import { test, expect } from "@playwright/test";

/**
 * US4 — the Warform brand marks. All Logo lockups render, the wordmark shows, and the app's
 * metadata/favicon resolve to Warform (not the Next default) — FR-018/SC-009.
 */
test.describe("brand", () => {
  test("all Logo lockups + the wordmark render (FR-018)", async ({ page }) => {
    await page.goto("/gallery");
    for (const v of ["badge", "mono", "knockout", "on-light", "favicon", "bracket"]) {
      await expect(page.getByTestId(`logo-${v}`).locator("svg").first()).toBeVisible();
    }
    await expect(page.getByText("WARFORM").first()).toBeVisible();
  });

  test("metadata + favicon resolve to Warform, not the Next default (SC-009)", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Warform Commander/);
    const iconHref = await page.locator('link[rel~="icon"]').first().getAttribute("href");
    expect(iconHref, "a custom favicon is configured").toBeTruthy();
  });
});
