// Sentry initialization for the Edge runtime (middleware, edge routes).
// Loaded from instrumentation.ts. Inert until NEXT_PUBLIC_SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  enableLogs: true,
  debug: false,
});
