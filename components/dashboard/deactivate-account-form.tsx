"use client";

import { useActionState, useState } from "react";
import { deactivateAccount } from "@/lib/actions/account";
import type { AuthState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  currentEmail: string | null;
};

export function DeactivateAccountForm({ currentEmail }: Props) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    deactivateAccount,
    undefined,
  );
  const [typed, setTyped] = useState("");

  // Disable submit until the typed value matches the user's email (case-
  // insensitive). Server validates the same — this is just UX, not security.
  const expected = (currentEmail ?? "").trim().toLowerCase();
  const matches =
    expected.length > 0 && typed.trim().toLowerCase() === expected;

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="confirmEmail">
          Type your email ({currentEmail ?? "unknown"}) to confirm
        </Label>
        <Input
          id="confirmEmail"
          name="confirmEmail"
          type="text"
          autoComplete="off"
          required
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        {state?.fieldErrors?.confirmEmail?.map((msg) => (
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
      <Button
        type="submit"
        variant="destructive"
        disabled={pending || !matches}
      >
        {pending ? "Deactivating…" : "Deactivate account"}
      </Button>
    </form>
  );
}
