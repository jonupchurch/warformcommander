import { defineConfig, devices } from "@playwright/test";

/**
 * E2E harness for the app shell + design system (Feature 3). The load-bearing SCs — responsive
 * shell (SC-001/SC-005), AA contrast + a11y (SC-003/SC-004), reduced motion (SC-006) — are the
 * kind of critical path a unit test can't reach, so they run in a real browser here.
 *
 * Specs drive the viewport matrix themselves (see `e2e/viewports.ts`) via `page.setViewportSize`,
 * so a single Chromium project is enough; the matrix lives in the tests, not the projects.
 */
const PORT = 3210;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
