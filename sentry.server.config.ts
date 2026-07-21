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
  // Drop expected auth-boundary rejections: `AuthError` (401/403 from server/authz.ts) is control
  // flow — an anonymous/non-admin request being turned away (e.g. a logged-out hit to /admin/*), not
  // a server fault. Reporting them is noise (like Next's own NEXT_REDIRECT, which Sentry already filters).
  beforeSend(event, hint) {
    if ((hint?.originalException as Error | undefined)?.name === "AuthError") return null;
    return event;
  },
});
