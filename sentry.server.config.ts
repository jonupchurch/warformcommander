// Sentry initialization for the Node.js server runtime.
// Loaded from instrumentation.ts. Inert until NEXT_PUBLIC_SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Trace 100% of transactions while traffic is low; lower under real load.
  tracesSampleRate: 1,
  // Forward structured logs to Sentry.
  enableLogs: true,
  debug: false,
});
