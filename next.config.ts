import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // The deterministic sim core runs server-side as WASM (constitution P6). Keep the wasm-bindgen
  // package external so Next/Turbopack doesn't try to bundle the .wasm through the JS pipeline
  // (research B2). The runtime loads it from the *real* `packages/engine-wasm` directory (see
  // sim/index.ts) rather than the `node_modules/@wfc/engine-wasm` workspace symlink, because that
  // symlink points at an absolute local path that doesn't exist on Vercel. So trace the whole
  // real package — the JS glue (`engine.js`), its `package.json`, AND `engine_bg.wasm` — into the
  // function bundle; tracing only the .wasm leaves `require` with no module entry (MODULE_NOT_FOUND).
  //
  // ⚠️ EVERY server route that reaches the engine needs its own entry here, or it 500s in prod with
  // `ENOENT .../packages/engine-wasm/engine.js` (fine locally — the file is on disk in dev). A route
  // touches the engine if it calls `resolveBattle`/`resolveBattleRaw` (`@/sim`),
  // `loadDefaultRuleset`/`validateSquad` (`@/sim/validate`), or a Server Action that does. So far:
  // `/api/resolve` (resolve) and `/garage` (Garage loads the default ruleset + validates on save).
  // When Arena/Ladder/Profile (F8–F10) call `server/matches.ts` (resolve/record), add their routes too.
  serverExternalPackages: ["@wfc/engine-wasm"],
  outputFileTracingIncludes: {
    "/api/resolve": ["./packages/engine-wasm/**/*"],
    "/garage": ["./packages/engine-wasm/**/*"],
    // Feature 8: the two ranked/practice resolve routes call resolveBattle in-process (P6).
    "/api/arena/resolve": ["./packages/engine-wasm/**/*"],
    "/api/practice/resolve": ["./packages/engine-wasm/**/*"],
  },
};

export default withSentryConfig(nextConfig, {
  // Source-map upload + release tracking. Provide these via the environment
  // (Vercel Sentry integration, or SENTRY_* project env vars). Without
  // SENTRY_AUTH_TOKEN the upload is skipped and the build still succeeds.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
