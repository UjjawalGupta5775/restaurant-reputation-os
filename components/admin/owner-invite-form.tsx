"use client";

import { useActionState } from "react";
import {
  inviteOwner,
  type OwnerActionState,
} from "@/lib/actions/owners";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function OwnerInviteForm({ businessId }: { businessId: string }) {
  const [state, action, pending] = useActionState<OwnerActionState, FormData>(
    inviteOwner,
    undefined,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Invite an owner</CardTitle>
        <CardDescription>
          Sends a Supabase invite email. If the address already has an account,
          they&apos;re added to this restaurant without re-sending an email.
        </CardDescription>
      </CardHeader>
      <form action={action}>
        <input type="hidden" name="businessId" value={businessId} />
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Owner email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="owner@restaurant.com"
            />
            {state?.fieldErrors?.email?.map((msg) => (
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
            <p
              role="status"
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/8 px-3 py-2 text-sm"
            >
              {state.info}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button
            type="submit"
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {pending ? "Sending…" : "Send invite"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
