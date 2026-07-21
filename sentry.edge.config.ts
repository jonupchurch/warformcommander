// Sentry initialization for the Edge runtime (middleware, edge routes).
// Loaded from instrumentation.ts. Inert until NEXT_PUBLIC_SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  enableLogs: true,
  debug: false,
  // Expected auth-boundary rejections (AuthError 401/403) are control flow, not faults — drop them.
  beforeSend(event, hint) {
    if ((hint?.originalException as Error | undefined)?.name === "AuthError") return null;
    return event;
  },
});
