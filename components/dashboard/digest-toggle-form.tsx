"use client";

import { useActionState } from "react";
import {
  setWeeklyDigestEnabled,
  type NotificationPrefsState,
} from "@/lib/actions/notification-preferences";
import { Button } from "@/components/ui/button";

type Props = {
  initialEnabled: boolean;
};

export function DigestToggleForm({ initialEnabled }: Props) {
  const [state, action, pending] = useActionState<
    NotificationPrefsState,
    FormData
  >(setWeeklyDigestEnabled, undefined);

  // Show the post-action enabled state when we have it; otherwise the
  // server-rendered value.
  const enabled = state?.ok ? state.enabled : initialEnabled;

  return (
    <form action={action} className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-medium">Weekly summary email</p>
          <p className="text-sm text-muted-foreground">
            Every Monday, a short recap of last week&apos;s activity across
            your restaurants. Sent to the email on your account.
          </p>
          <p className="text-xs text-muted-foreground">
            Currently:{" "}
            <span className="font-medium text-foreground">
              {enabled ? "On" : "Off"}
            </span>
          </p>
        </div>
      </div>
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <Button
        type="submit"
        variant={enabled ? "outline" : "default"}
        disabled={pending}
      >
        {pending
          ? "Updating…"
          : enabled
            ? "Turn off weekly summary"
            : "Turn on weekly summary"}
      </Button>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-sm text-muted-foreground">
          Preferences updated.
        </p>
      )}
    </form>
  );
}
