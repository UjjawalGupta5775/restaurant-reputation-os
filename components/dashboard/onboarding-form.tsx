"use client";

import { useActionState } from "react";
import {
  createOwnBusiness,
  type BusinessFormState,
} from "@/lib/actions/businesses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<BusinessFormState, FormData>(
    createOwnBusiness,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Business name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="organization"
          required
          maxLength={120}
          placeholder="e.g. The Curry Pot"
        />
        {state?.fieldErrors?.name?.map((msg) => (
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
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Creating…" : "Create business"}
      </Button>
    </form>
  );
}
