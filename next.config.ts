import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// withSentryConfig is safe to apply unconditionally — when SENTRY_DSN /
// SENTRY_AUTH_TOKEN aren't set, source-map upload and release tagging
// are skipped automatically. Org + project come from env so they don't
// need to live in the repo.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  // Strip source-map references from public bundles once uploaded —
  // Sentry still gets them, but end users don't.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  // Don't fail the build if Sentry CLI can't upload (missing token in
  // PR previews, network blip, etc).
  errorHandler: () => {},
});

