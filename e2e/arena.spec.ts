import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { VIEWPORTS } from './viewports';

/**
 * Feature 8 — Arena e2e (T048). The full deploy → resolve → summary handoff needs an authenticated
 * session + DB + WASM, so — like the Feature 4 authed paths — it is exercised by the DB-integration
 * suites (`tests/arena.test.ts`) and the route test, not this browserless-auth harness. What a real
 * browser uniquely verifies here is that the **signed-out Arena screen** renders correctly, is
 * first-class in both orientations, and is accessible: the anonymous gate a would-be attacker meets.
 */

const ROUTE = '/arena';

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('signed-out gate', () => {
  test('renders the ARENA heading and a sign-in call to action', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { level: 1, name: 'ARENA' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Sign in/ })).toHaveAttribute(
      'href',
      '/api/auth/signin',
    );
  });
});

test.describe('polish — both orientations, accessible', () => {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    test(`no horizontal overflow at ${name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto(ROUTE);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
      await expect(page.getByRole('heading', { level: 1, name: 'ARENA' })).toBeVisible();
    });
  }

  test('no serious/critical a11y violations', async ({ page }) => {
    await page.goto(ROUTE);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`).join(', ')).toBe('');
  });
});
