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
