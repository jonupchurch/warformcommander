import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { VIEWPORTS } from './viewports';

/**
 * Feature 10 — Profile e2e (T009/T031). The full career render is pinned by the DB-integration
 * assembly test (career==standing, public-only, rows); a real browser verifies what it uniquely can
 * without seeded auth: the own-profile sign-in gate, the unknown-handle not-found, both-orientation
 * no-overflow (SC-003), and a clean axe pass.
 */

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('own profile — signed-out gate', () => {
  test('renders the PROFILE heading + a sign-in CTA', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'PROFILE' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Sign in/ })).toHaveAttribute('href', '/api/auth/signin');
  });

  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    test(`no horizontal overflow at ${name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/profile');
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('public profile — unknown handle', () => {
  test('an unknown commander handle renders the not-found dead-end (FR-005)', async ({ page }) => {
    await page.goto('/commander/zzz-no-such-commander-42');
    await expect(page.getByRole('heading', { level: 1, name: /COMMANDER NOT FOUND/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to the Ladder/ })).toHaveAttribute('href', '/ladder');
  });
});

test.describe('polish — accessible', () => {
  test('no serious/critical a11y violations on the profile gate', async ({ page }) => {
    await page.goto('/profile');
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`).join(', ')).toBe('');
  });
});
