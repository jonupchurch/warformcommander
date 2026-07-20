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
  serverExternalPackages: ["@wfc/engine-wasm"],
  outputFileTracingIncludes: {
    "/api/resolve": ["./packages/engine-wasm/**/*"],
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
