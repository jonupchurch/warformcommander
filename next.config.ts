import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // The deterministic sim core runs server-side as WASM (constitution P6). Keep the wasm-bindgen
  // package external so Next/Turbopack doesn't try to bundle the .wasm through the JS pipeline
  // (research B2), and make sure the .wasm file itself is traced into the /api/resolve function
  // bundle on Vercel (otherwise the runtime import 404s).
  serverExternalPackages: ["@wfc/engine-wasm"],
  outputFileTracingIncludes: {
    "/api/resolve": ["./node_modules/@wfc/engine-wasm/**/*.wasm"],
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
