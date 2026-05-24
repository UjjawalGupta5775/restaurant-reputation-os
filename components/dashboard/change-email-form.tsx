"use client";

import { useActionState } from "react";
import { changeEmail } from "@/lib/actions/account";
import type { AuthState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  currentEmail: string | null;
};

export function ChangeEmailForm({ currentEmail }: Props) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    changeEmail,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">New email</Label>
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
  );
}
