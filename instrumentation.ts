// Server-side Sentry init. Runs once per Next.js server instance startup,
// per the instrumentation.js file convention. We branch on NEXT_RUNTIME so
// the Node.js runtime and the Edge runtime each get their appropriate
// Sentry transport. Both initialisers no-op when SENTRY_DSN is unset, so
// CI builds and local dev without a DSN stay clean.

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (!process.env.SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    });
  }
}

// Forwarded to Sentry on every server-side request error (App Router,
// Pages Router, route handlers, Server Actions). Captures errors that
// happen during the request before they bubble back to the framework.
export const onRequestError = Sentry.captureRequestError;
