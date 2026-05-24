"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// global-error replaces the root layout when active. Must define its own
// <html> and <body>. No global styles available — keep this dependency-free.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          textAlign: "center",
          gap: "1rem",
          background: "#fff",
          color: "#111",
        }}
      >
        <title>Something went wrong</title>
        <h1 style={{ fontSize: "1.75rem", margin: 0, fontWeight: 500 }}>
          Something went wrong
        </h1>
        <p style={{ maxWidth: "28rem", margin: 0, color: "#555" }}>
          We&apos;ve been notified. Try again in a moment.
        </p>
        {error.digest && (
          <p
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.75rem",
              color: "#888",
              margin: 0,
            }}
          >
            ref: {error.digest}
          </p>
        )}
        <button
          onClick={() => unstable_retry()}
          style={{
            padding: "0.5rem 1rem",
            background: "#111",
            color: "#fff",
            border: "none",
            borderRadius: "0.5rem",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
