"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

export default function Error({
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
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        Error
      </p>
      <h1 className="font-serif text-3xl tracking-tight">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        We&apos;ve been notified. Try again in a moment, or return to the
        dashboard.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">
          ref: {error.digest}
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={() => unstable_retry()}>Try again</Button>
      </div>
    </main>
  );
}
