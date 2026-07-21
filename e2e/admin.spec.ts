import { test, expect } from '@playwright/test';

/**
 * Feature 12 — admin console gate (US2), the browser-observable half. The console is fully behind the
 * server-side admin gate; without a seeded admin session a real browser can verify the load-bearing
 * property: an anonymous visitor is bounced off every `/admin*` route (the layer-1 proxy + layer-2
 * layout redirect). The mutation-level denial matrix (forged flags, direct action calls, the webhook
 * secret) is pinned by the server integration tests (tests/ruleset-store.test.ts, tests/devlog.test.ts).
 */

test.describe('admin console — signed-out gate (SC-001)', () => {
  for (const route of ['/admin', '/admin/balance']) {
    test(`${route} bounces an anonymous visitor away from the console`, async ({ page }) => {
      await page.goto(route);
      // Redirected to sign-in / home — never left rendering inside /admin.
      await expect(page).not.toHaveURL(/\/admin(\/|$)/);
    });
  }
});
