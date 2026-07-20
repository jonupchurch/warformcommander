import { test, expect } from "@playwright/test";

/**
 * US3 — the primitive kit is token-driven and shadcn-themed. We assert variant tokens resolve
 * correctly, data-driven primitives (StatBar/Chip) reflect their inputs, and a *stock* shadcn
 * overlay renders on-brand + focus-traps + closes on Escape (SC-007/FR-013/FR-014). Focus-ring
 * *visibility* is covered by the keyboard pass in US5 (a11y.spec).
 */
test.describe("primitives", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/gallery");
  });

  test("Button variants apply the right tokens (FR-013)", async ({ page }) => {
    const primary = page.getByTestId("btn-primary");
    await expect(primary).toHaveCSS("background-color", "rgb(42, 212, 255)"); // faction-friendly
    await expect(primary).toHaveCSS("color", "rgb(6, 8, 11)"); // void label

    const secondary = page.getByTestId("btn-secondary");
    await expect(secondary).toHaveCSS("background-color", "rgba(0, 0, 0, 0)"); // bare
    const borderWidth = await secondary.evaluate((n) => getComputedStyle(n).borderTopWidth);
    expect(parseFloat(borderWidth), "secondary has an outline border").toBeGreaterThan(0);

    const ghost = page.getByTestId("btn-ghost");
    await expect(ghost).toHaveCSS("background-color", "rgba(0, 0, 0, 0)"); // bare
    const ghostBorder = await ghost.evaluate((n) => getComputedStyle(n).borderTopWidth);
    expect(parseFloat(ghostBorder), "ghost has no border").toBe(0);
  });

  test("StatBar fills to value; Chip tone applies the family tint (FR-013)", async ({ page }) => {
    const bar = page.getByRole("progressbar", { name: "HULL" });
    await expect(bar).toHaveAttribute("aria-valuenow", "75");
    const ratio = await bar.evaluate((track) => {
      const fill = track.firstElementChild as HTMLElement;
      return fill.getBoundingClientRect().width / track.getBoundingClientRect().width;
    });
    expect(ratio, "fill ≈ 75%").toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(0.8);

    await expect(page.getByTestId("chip-kinetic")).toHaveCSS("color", "rgb(42, 212, 255)");
  });

  test("stock shadcn overlays: themed, focus-trapped, Escape-close (SC-007/FR-014)", async ({
    page,
  }) => {
    // Dropdown menu — themed by the popover base token (surface-raised = #0d1218).
    await page.getByTestId("menu-trigger").click();
    const menu = page.getByTestId("menu-content");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS("background-color", "rgb(13, 18, 24)");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    // Dialog — focus moves in, Escape closes.
    await page.getByTestId("dialog-trigger").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Confirm Deployment" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
