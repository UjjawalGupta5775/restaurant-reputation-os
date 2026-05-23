"use client";

import { useActionState } from "react";
import {
  confirmUnsubscribe,
  type UnsubscribeResult,
} from "@/lib/actions/unsubscribe";
import { Button } from "@/components/ui/button";

type State = UnsubscribeResult | undefined;

async function action(_prev: State, formData: FormData): Promise<State> {
  const token = formData.get("token");
  if (typeof token !== "string") {
    return { ok: false, error: "Invalid request." };
  }
  return confirmUnsubscribe(token);
}

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    action,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="space-y-3">
        <p className="text-base text-foreground">
          You&apos;re unsubscribed. We won&apos;t send you weekly summaries
          anymore.
        </p>
        <p className="text-sm text-muted-foreground">
          You can re-enable them at any time from your dashboard settings.
        </p>
      </div>
    );
  }

  if (state && !state.ok) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted-foreground">
        Confirm below and you won&apos;t receive the weekly summary again.
      </p>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Unsubscribing…" : "Confirm unsubscribe"}
      </Button>
    </form>
  );
}
