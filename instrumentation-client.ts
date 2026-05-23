// Client-side Sentry init. Next 16 auto-loads this file in the browser
// bundle when present at the project root. The init is a no-op when the
// DSN env var is unset so local dev and CI builds without secrets are
// untouched.

import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
    ),
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  });
}

// Exported regardless of DSN — Sentry's hook is a no-op when init didn't run.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
