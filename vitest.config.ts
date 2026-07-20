import { defineConfig } from "vitest/config";

/**
 * The DB integration suite (Feature 7) runs against the **local dev Postgres** (`.env.dev.local`,
 * injected by the `test` script via dotenv-cli — never the Neon prod branch). Test files share the
 * one database and truncate between tests, so files must not run in parallel.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    hookTimeout: 20_000,
    testTimeout: 20_000,
    // Load the `@/*` → repo-root alias the app uses (mirrors tsconfig paths).
    alias: { "@/": new URL("./", import.meta.url).pathname },
  },
});
