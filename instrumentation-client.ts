// Sentry initialization for the browser. Runs on the client.
// Inert until NEXT_PUBLIC_SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  debug: false,
});

// Enables tracing of App Router client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
