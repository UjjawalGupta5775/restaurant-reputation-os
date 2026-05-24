"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword } from "@/lib/actions/account";
import type { AuthState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    changePassword,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the inputs on a successful update so the form doesn't keep the
  // stale (now wrong) current-password value sitting in the field.
  useEffect(() => {
    if (state?.info) formRef.current?.reset();
  }, [state?.info]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
        {state?.fieldErrors?.currentPassword?.map((msg) => (
          <p key={msg} role="alert" className="text-sm text-destructive">
            {msg}
          </p>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        {state?.fieldErrors?.newPassword?.map((msg) => (
          <p key={msg} role="alert" className="text-sm text-destructive">
            {msg}
          </p>
        ))}
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
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
