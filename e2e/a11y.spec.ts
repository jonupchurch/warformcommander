import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility floor for the design system (SC-003/SC-004). US1 seeds it with a color-contrast
 * scan of the token gallery; US5 (T046–T047) hardens the full shell + gallery to zero serious
 * violations and adds the focus-visible check. Keeping it in one spec means the a11y bar grows
 * with the system rather than bolted on at the end.
 */

test("gallery: no color-contrast violations (SC-003)", async ({ page }) => {
  await page.goto("/gallery");
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  expect(results.violations).toEqual([]);
});

test("shell + gallery: no serious/critical a11y violations (US5/SC-004)", async ({ page }) => {
  for (const url of ["/garage", "/gallery"]) {
    await page.goto(url);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => v.id).join(", "), `${url}`).toBe("");
  }
});

test("keyboard focus shows a visible ring on interactive elements (US5/FR-019)", async ({ page }) => {
  await page.goto("/garage"); // shell: first Tab lands on the skip link
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  const ring = await focused.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      outlineWidth: parseFloat(s.outlineWidth) || 0,
      outlineStyle: s.outlineStyle,
      boxShadow: s.boxShadow,
    };
  });
  // A visible ring = a real outline (width + non-none style) OR a box-shadow ring.
  const hasOutline = ring.outlineStyle !== "none" && ring.outlineWidth > 0;
  const hasShadow = Boolean(ring.boxShadow) && ring.boxShadow !== "none";
  expect(hasOutline || hasShadow, `ring: ${JSON.stringify(ring)}`).toBe(true);
});
