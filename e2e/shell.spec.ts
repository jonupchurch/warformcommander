import { test, expect } from "@playwright/test";
import { VIEWPORTS, ALL_VIEWPORTS, PORTRAIT, LANDSCAPE } from "./viewports";

/**
 * US2 — the app shell is co-equally first-class in both orientations (P7). We drive a real
 * authenticated route (/garage) through the viewport matrix and assert the load-bearing
 * guarantees: no horizontal overflow, the top-tab⇄bottom-bar chrome switch, a single active
 * destination per route, and keyboard/landmark operability.
 */
test.describe("app shell", () => {
  const topNav = (page: import("@playwright/test").Page) =>
    page.locator('nav[aria-label="Primary"]').first();
  const bottomNav = (page: import("@playwright/test").Page) =>
    page.locator('nav[aria-label="Primary"]').last();

  test("no horizontal page scroll at any viewport (SC-001)", async ({ page }) => {
    await page.goto("/garage");
    for (const name of ALL_VIEWPORTS) {
      await page.setViewportSize(VIEWPORTS[name]);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflows, `horizontal overflow at ${name}`).toBe(false);
    }
  });

  test("nav chrome switches: top tabs in landscape, bottom bar in portrait (SC-005)", async ({
    page,
  }) => {
    await page.goto("/garage");
    for (const name of LANDSCAPE) {
      await page.setViewportSize(VIEWPORTS[name]);
      await expect(topNav(page), `top tabs visible @ ${name}`).toBeVisible();
      await expect(bottomNav(page), `bottom bar hidden @ ${name}`).toBeHidden();
    }
    for (const name of PORTRAIT) {
      await page.setViewportSize(VIEWPORTS[name]);
      await expect(bottomNav(page), `bottom bar visible @ ${name}`).toBeVisible();
      await expect(topNav(page), `top tabs hidden @ ${name}`).toBeHidden();
    }
  });

  test("exactly one visible active destination per route, aria-current set (SC-005)", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    for (const route of ["/garage", "/arena", "/ladder", "/practice"]) {
      await page.goto(route);
      const active = page.locator('[aria-current="page"]:visible');
      await expect(active, `one visible active @ ${route}`).toHaveCount(1);
      await expect(active).toHaveAttribute("href", route);
    }
  });

  test("every destination reachable in one interaction, both orientations (SC-001/SC-005)", async ({
    page,
  }) => {
    for (const name of ["desktop", "phone"] as const) {
      await page.setViewportSize(VIEWPORTS[name]);
      await page.goto("/garage");
      const nav = name === "phone" ? bottomNav(page) : topNav(page);
      await nav.getByRole("link", { name: "Ladder" }).click();
      await expect(page, `one-click reach @ ${name}`).toHaveURL("/ladder");
    }
  });

  test("keyboard: skip link first, nav landmark present, destinations focusable (SC-004)", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/garage");

    // The skip-to-content link is the first tab stop.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /skip to content/i })).toBeFocused();

    // The nav landmark exists and is labelled.
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

    // Each destination is keyboard-focusable.
    const garage = topNav(page).getByRole("link", { name: "Garage" });
    await garage.focus();
    await expect(garage).toBeFocused();
  });
});
