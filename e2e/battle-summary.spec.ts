import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { VIEWPORTS } from './viewports';

/**
 * Feature 6 — Battle Summary e2e (T021/T027/T028/T030). The critical paths a unit test can't reach:
 * the action seams navigate to Battle Playback / Arena (and mount no player — SC-007), the surface is
 * first-class in both orientations with no horizontal scroll (SC-004/P7), it is axe-clean with the
 * verdict as a heading (SC-004), and under reduced motion every outcome fact is present as text
 * (SC-008). The route renders the committed demo battery result (a 2-0 Conquest VICTORY with an MVP).
 */

const ROUTE = '/matches/e2e-match/summary';

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('US1/US2 — the outcome renders', () => {
  test('verdict heading, series, per-game condition, totals, MVP, and fates are present', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByRole('heading', { level: 1, name: /VICTORY|DEFEAT/ })).toBeVisible();
    await expect(page.getByText('MATCH COMPLETE · BEST OF 3')).toBeVisible();
    await expect(page.getByText('PER-GAME BREAKDOWN')).toBeVisible();
    await expect(page.getByText('DAMAGE DEALT').first()).toBeVisible();
    await expect(page.getByText('★ MATCH MVP')).toBeVisible();
    await expect(page.getByText('YOUR MACHINES')).toBeVisible();
    await expect(page.getByText('ENEMY MACHINES')).toBeVisible();
  });
});

test.describe('US3 — action seams (SC-007)', () => {
  test('Watch Full Replay targets Battle Playback for this match; no player is mounted', async ({ page }) => {
    await page.goto(ROUTE);
    const watch = page.getByRole('link', { name: /Watch Full Replay/ });
    await expect(watch).toHaveAttribute('href', '/battle/e2e-match');
    // The summary is a reader — it mounts no replay slider / canvas player.
    await expect(page.getByRole('slider', { name: 'Battle timeline' })).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('Find Next Opponent and Back target the arena', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByRole('link', { name: /Find Next Opponent/ })).toHaveAttribute('href', '/arena');
    await expect(page.getByRole('link', { name: /Back to Arena/ })).toHaveAttribute('href', '/arena');
  });

  test('Watch Full Replay actually navigates to the Battle Playback route', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('link', { name: /Watch Full Replay/ }).click();
    await expect(page).toHaveURL(/\/battle\/e2e-match$/);
  });
});

test.describe('US5 polish — both orientations, accessible, motion-safe', () => {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    test(`no horizontal overflow and actions reachable at ${name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto(ROUTE);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
      await expect(page.getByRole('heading', { level: 1, name: /VICTORY|DEFEAT/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /Find Next Opponent/ })).toBeVisible();
    });
  }

  test('no serious/critical a11y violations; the verdict is a heading (SC-004)', async ({ page }) => {
    await page.goto(ROUTE);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`).join(', ')).toBe('');
  });

  test('reduced motion keeps every outcome fact present as text (SC-008)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(ROUTE);
    // The verdict, a win condition, and a reward tier are all present as readable text.
    await expect(page.getByRole('heading', { level: 1, name: /VICTORY|DEFEAT/ })).toBeVisible();
    await expect(page.getByText('CONQUEST').first()).toBeVisible();
    await expect(page.getByText(/FULL|LESSER/).first()).toBeVisible();
  });
});
