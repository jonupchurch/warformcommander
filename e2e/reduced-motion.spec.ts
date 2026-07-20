import { test, expect } from "@playwright/test";

/**
 * US5 — with `prefers-reduced-motion: reduce`, decorative animation is neutralized (the global
 * reset in globals.css) while the UI stays fully operable (SC-006). We prove it on a real animated
 * surface: the shadcn dialog still opens/closes, with its enter animation suppressed.
 */
test("reduced motion neutralizes animation but keeps the UI operable (SC-006)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/gallery");

  await page.getByTestId("dialog-trigger").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible(); // operable

  // The global reduced-motion reset collapses animation-duration to ~0.
  const duration = await dialog.evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(duration), `animation-duration=${duration}`).toBeLessThan(0.05);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
