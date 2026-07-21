import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { VIEWPORTS } from './viewports';

/**
 * Feature 9 — Ladder e2e (T012/T013/T032). The board is public, so a real browser verifies the
 * load-bearing presentation guarantees without seeded auth: the board is first-class in both
 * orientations with **no horizontal page scroll** (SC-003), the pinned viewer card is always present
 * (signed-out → sign-in), the net-victory explainer states the model (SC-003/US4), and the surface is
 * axe-clean. Ranking correctness itself is pinned by the DB-integration query tests.
 */

const ROUTE = '/ladder';

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('US1 — the board renders, both orientations', () => {
  test('LADDER heading + the pinned viewer standing card are present', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { level: 1, name: 'LADDER' })).toBeVisible();
    await expect(page.getByText('YOUR STANDING')).toBeVisible();
  });

  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    test(`no horizontal page scroll at ${name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto(ROUTE);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
      await expect(page.getByRole('heading', { level: 1, name: 'LADDER' })).toBeVisible();
    });
  }
});

test.describe('US4 — the net-victory model is explained', () => {
  for (const [name, vp] of Object.entries({ phone: VIEWPORTS.phone, desktop: VIEWPORTS.desktop })) {
    test(`explainer states the formula + that defense losses subtract at ${name}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto(ROUTE);
      await expect(page.getByText(/net victories\s*=\s*attack wins\s*[−-]\s*defense losses/i)).toBeVisible();
      await expect(page.getByText(/defense losses.*subtract|subtract/i).first()).toBeVisible();
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('polish — accessible', () => {
  test('no serious/critical a11y violations', async ({ page }) => {
    await page.goto(ROUTE);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`).join(', ')).toBe('');
  });
});
