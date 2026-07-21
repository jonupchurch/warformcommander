import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { VIEWPORTS } from './viewports';

/**
 * Feature 11 — Marketing site e2e (US1–US5). The published-only read boundary (drafts/future never
 * public, `publishedAt` ordering) is proven in-query by the DB-integration tests (`tests/news.test.ts`);
 * a real browser verifies what it uniquely can without seeded data: the Home pitch + exact non-P2W
 * promise + pillars + roadmap + CTAs (US1), the shared shell/nav/footer with correct active state
 * (US2), the News index frame (US3), a 404 for an unknown article slug (US4), the SEO/OG/sitemap/feed
 * surfaces (US5), both-orientation no-overflow (SC-005, P7), and a clean axe pass.
 */

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('US1 — Home sells the game + the non-P2W promise', () => {
  test('renders the pitch, the exact promise, the pillars, the roadmap, and the CTAs', async ({
    page,
  }) => {
    await page.goto('/');

    // The one-line pitch (hero H1) + the exact non-P2W brand promise (SC-008).
    await expect(page.getByRole('heading', { level: 1, name: /Command warforms\. Win on the plan\./ })).toBeVisible();
    await expect(page.getByText('Skill lives in the plan — never the wallet.').first()).toBeVisible();

    // The four pillars, incl. the explicit non-P2W pillar (P1).
    await expect(page.getByRole('heading', { name: /Non-pay-to-win by construction/ })).toBeVisible();

    // The roadmap snapshot's v1 / Later split.
    await expect(page.getByText('In v1', { exact: true })).toBeVisible();
    await expect(page.getByText('Later', { exact: true })).toBeVisible();
    await expect(page.getByText('Deterministic Bo3 battle engine')).toBeVisible();

    // Working CTAs (rendered as links via Button asChild).
    await expect(page.getByRole('link', { name: 'Wishlist' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'How to Play' }).first()).toBeVisible();
  });

  test('emits a non-empty title, description, and OpenGraph metadata (SC-006)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Warform Commander');

    const description = await page.locator('head meta[name="description"]').getAttribute('content');
    expect(description && description.length).toBeGreaterThan(0);

    const ogTitle = await page.locator('head meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).toBe('Warform Commander');
    const ogDescription = await page.locator('head meta[property="og:description"]').getAttribute('content');
    expect(ogDescription && ogDescription.length).toBeGreaterThan(0);
  });

  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    test(`no horizontal overflow on Home at ${name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/');
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('US2 — the shared shell frames every page', () => {
  test('header (brand + nav + Wishlist) and footer render on Home and News', async ({ page }) => {
    for (const route of ['/', '/news']) {
      await page.goto(route);
      // Nav destinations (present in DOM in both the landscape + portrait navs — assert ≥1).
      for (const label of ['Overview', 'News', 'Roadmap', 'Community']) {
        expect(await page.getByRole('link', { name: label, exact: true }).count()).toBeGreaterThan(0);
      }
      // Footer brand blurb + copyright.
      await expect(page.getByText('© Warform Commander. All systems nominal.')).toBeVisible();
    }
  });

  test('the News destination is marked active (aria-current) on /news, not on Home', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('[aria-current="page"]').count()).toBe(0);

    await page.goto('/news');
    const current = page.locator('[aria-current="page"]').first();
    await expect(current).toHaveText('News');
  });
});

test.describe('US3 — the News index frame', () => {
  test('renders the Dispatches heading + category filter, no overflow both orientations', async ({
    page,
  }) => {
    await page.goto('/news');
    await expect(page.getByRole('heading', { level: 1, name: 'Dispatches' })).toBeVisible();

    for (const vp of [VIEWPORTS.phone, VIEWPORTS.desktop]) {
      await page.setViewportSize(vp);
      await page.goto('/news');
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
      await expect(page.getByRole('heading', { level: 1, name: 'Dispatches' })).toBeVisible();
    }
  });
});

test.describe('US4 — an unknown/unpublished article 404s', () => {
  // A draft slug and an unknown slug are indistinguishable — both resolve to `null` from the read
  // layer and both render this one not-found surface (SC-004). We assert the rendered not-found page
  // (the repo's `profile.spec` convention) rather than the raw HTTP status: Next's dev server serves a
  // soft-404 (200) for `notFound()`, while `next build && next start` returns a true 404 — the latter
  // is verified against a production build in the feature's verification step.
  test('an unknown slug renders the marketing not-found dead-end (SC-004)', async ({ page }) => {
    await page.goto('/news/zzz-no-such-dispatch-9999');
    await expect(page.getByRole('heading', { level: 1, name: /Dispatch not found/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to the news/ })).toHaveAttribute('href', '/news');
  });
});

test.describe('US5 — discoverable + shareable (SEO / sitemap / robots / RSS)', () => {
  test('/sitemap.xml lists the static routes as a valid urlset', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('<urlset');
    expect(body).toMatch(/<loc>[^<]*\/news<\/loc>/);
    expect(body).toMatch(/<loc>[^<]*\/<\/loc>/);
  });

  test('/robots.txt allows indexing, blocks the app, and references the sitemap', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/Allow:\s*\//);
    expect(body).toMatch(/Disallow:\s*\/garage/);
    expect(body).toMatch(/Sitemap:\s*https?:\/\/[^\s]+\/sitemap\.xml/);
  });

  test('/feed.xml is a valid RSS 2.0 channel', async ({ request }) => {
    const res = await request.get('/feed.xml');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/rss+xml');
    const body = await res.text();
    expect(body).toContain('<rss version="2.0">');
    expect(body).toContain('<channel>');
    expect(body).toContain('<title>Warform Commander — Dispatches</title>');
  });
});

test.describe('polish — accessible', () => {
  for (const route of ['/', '/news']) {
    test(`no serious/critical a11y violations on ${route}`, async ({ page }) => {
      await page.goto(route);
      const { violations } = await new AxeBuilder({ page }).analyze();
      const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.length}`).join(', ')).toBe('');
    });
  }
});
