import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { VIEWPORTS } from './viewports';

/**
 * Feature 5 — Battle Playback e2e (T011/T020/T025/T029/T032–T034). The interactive stories a unit
 * test can't reach: the play-through halts at the last tick, the O(1) scrubber seeks by keyboard +
 * marker while paused and playing, the control cluster paces/steps/jumps, and the whole surface is
 * first-class in both orientations, accessible, and motion-safe. The route renders the committed
 * native battery replay (2 games × 145 ticks, with deaths).
 */

const ROUTE = '/battle/e2e';
const LAST_TICK = 144; // 145 ticks → last index

const slider = (page: Page) => page.getByRole('slider', { name: 'Battle timeline' });
const value = async (page: Page) => Number(await slider(page).inputValue());

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('US1 — watch a stored replay start→finish', () => {
  test('play advances the tick and halts cleanly at the last tick (AS2/AS3)', async ({ page }) => {
    await page.goto(ROUTE);
    expect(await value(page)).toBe(0);

    // Seek near the end so the halt is observable fast; keyboard seek is one O(1) index.
    await slider(page).focus();
    await page.keyboard.press('End'); // → 144
    await page.keyboard.press('PageDown'); // → 134
    expect(await value(page)).toBe(LAST_TICK - 10);

    await page.getByRole('button', { name: 'Play' }).click();
    // It advances and stops exactly at the last tick, flipping back to a Play/Replay control.
    await expect.poll(() => value(page), { timeout: 4000 }).toBe(LAST_TICK);
    await expect(page.getByRole('button', { name: /Play|Replay from start/ })).toBeVisible();
  });

  test('a destroyed unit shows the DOWN treatment at the end of the battle (AS4)', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: 'Jump to end' }).click();
    expect(await value(page)).toBe(LAST_TICK);
    // The battery ends with casualties — at least one sprite reads DOWN and is marked not-alive.
    await expect(page.locator('[data-slot="unit-sprite"][data-alive="false"]').first()).toBeVisible();
    await expect(page.getByText('DOWN').first()).toBeVisible();
  });
});

test.describe('US2 — scrub and seek (the O(1) headline)', () => {
  test('keyboard model: Home/End/Arrows/PageUp-Down seek exactly (paused)', async ({ page }) => {
    await page.goto(ROUTE);
    await slider(page).focus();

    await page.keyboard.press('End');
    expect(await value(page)).toBe(LAST_TICK);
    await page.keyboard.press('ArrowRight'); // clamps at the end
    expect(await value(page)).toBe(LAST_TICK);
    await page.keyboard.press('Home');
    expect(await value(page)).toBe(0);
    await page.keyboard.press('ArrowLeft'); // clamps at the start
    expect(await value(page)).toBe(0);
    await page.keyboard.press('ArrowRight');
    expect(await value(page)).toBe(1);
    await page.keyboard.press('PageUp'); // +10
    expect(await value(page)).toBe(11);
    await page.keyboard.press('PageDown'); // -10
    expect(await value(page)).toBe(1);
  });

  test('seeking during playback jumps and keeps playing (jump-and-continue)', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await slider(page).focus();
    await page.keyboard.press('Home'); // seek to 0 mid-play
    // Still playing (jump-and-continue) and advancing again from the seeked tick.
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect.poll(() => value(page), { timeout: 3000 }).toBeGreaterThan(0);
  });
});

test.describe('US3 — speed, frame-step, jump', () => {
  test('speed toggle sets the active rate', async ({ page }) => {
    await page.goto(ROUTE);
    const twoX = page.getByRole('button', { name: '2×' });
    await twoX.click();
    await expect(twoX).toHaveAttribute('aria-pressed', 'true');
  });

  test('frame-step moves exactly one tick and pauses; jump-to-start/end', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByRole('button', { name: 'Jump to end' }).click();
    expect(await value(page)).toBe(LAST_TICK);
    await page.getByRole('button', { name: 'Jump to start' }).click();
    expect(await value(page)).toBe(0);

    await page.getByRole('button', { name: 'Step forward one tick' }).click();
    expect(await value(page)).toBe(1);
    await page.getByRole('button', { name: 'Step back one tick' }).click();
    expect(await value(page)).toBe(0);
    // Stepping leaves playback paused.
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });
});

test.describe('US4 — event markers seek', () => {
  test('markers render with labels and activating one seeks to its tick', async ({ page }) => {
    await page.goto(ROUTE);
    const markers = page.locator('[data-slot="timeline-markers"] button');
    await expect(markers.first()).toBeVisible();
    expect(await markers.count()).toBeGreaterThan(0);

    const label = await markers.first().getAttribute('aria-label');
    const tick = Number(/tick (\d+)/.exec(label ?? '')?.[1]);
    expect(Number.isFinite(tick)).toBe(true);
    await markers.first().click();
    expect(await value(page)).toBe(tick);
  });
});

test.describe('US5 — both orientations, accessible, motion-safe', () => {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    test(`no horizontal overflow and controls operable at ${name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto(ROUTE);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
      await expect(slider(page)).toBeVisible();
      await page.getByRole('button', { name: 'Play' }).click();
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    });
  }

  test('no serious/critical a11y violations; slider is a labelled media-seek (SC-008)', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(slider(page)).toHaveAttribute('aria-valuetext', /tick \d+ of \d+/);

    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`).join(', ')).toBe('');
  });

  test('reduced motion keeps play/seek functional and snaps the node (SC-009)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(ROUTE);

    // Seek still works…
    await page.getByRole('button', { name: 'Jump to end' }).click();
    expect(await value(page)).toBe(LAST_TICK);
    // …and the contact node has no transition under reduced motion (motion-safe gate).
    const dur = await page
      .locator('[data-slot="contact-line"] > div:last-child')
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(parseFloat(dur)).toBeLessThan(0.05);
  });

  test('switching Bo3 games resets to that game tick 0 (AS5)', async ({ page }) => {
    await page.goto(ROUTE);
    await slider(page).focus();
    await page.keyboard.press('PageUp'); // → 10
    expect(await value(page)).toBe(10);
    await page.getByRole('button', { name: 'GAME 2' }).click();
    expect(await value(page)).toBe(0);
  });
});
