import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
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
