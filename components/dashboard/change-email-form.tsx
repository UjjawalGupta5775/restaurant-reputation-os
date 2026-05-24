"use client";

import { useActionState, useTransition } from "react";
import { changeEmail, cancelPendingEmailChange } from "@/lib/actions/account";
import type { AuthState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  currentEmail: string | null;
  pendingEmail: string | null;
  pendingSince: string | null;
};

function formatSentAgo(iso: string | null): string {
  if (!iso) return "recently";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "recently";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function ChangeEmailForm({ currentEmail, pendingEmail, pendingSince }: Props) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    changeEmail,
    undefined,
  );
  const [cancelling, startCancel] = useTransition();

  const hasPending = Boolean(pendingEmail && pendingEmail !== currentEmail);

  return (
    <div className="space-y-4">
      {hasPending && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            Pending change to {pendingEmail}
          </p>
          <p className="mt-1 text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
            Sent {formatSentAgo(pendingSince)}. Click the link in{" "}
            <strong>both</strong> {currentEmail ?? "your current"} and{" "}
            {pendingEmail} to finish the change. Links expire after about an hour.
          </p>
          <form
            action={async () => {
              startCancel(async () => {
                await cancelPendingEmailChange();
              });
            }}
            className="mt-2"
          >
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={cancelling}
            >
              {cancelling ? "Cancelling…" : "Cancel pending change"}
            </Button>
          </form>
        </div>
      )}

      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">
            {hasPending ? "Change to a different address" : "New email"}
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue=""
            placeholder={currentEmail ?? ""}
          />
          {state?.fieldErrors?.email?.map((msg) => (
            <p key={msg} role="alert" className="text-sm text-destructive">
              {msg}
            </p>
          ))}
          <p className="text-xs text-muted-foreground leading-relaxed">
            We&apos;ll email confirmation links to BOTH your current address
            ({currentEmail ?? "unknown"}) and the new one. Click the link in
            both inboxes to finalize the change.
          </p>
        </div>
        {state?.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state?.info && (
          <p role="status" className="text-sm text-foreground">
            {state.info}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Change email"}
        </Button>
      </form>
    </div>
  );
}
