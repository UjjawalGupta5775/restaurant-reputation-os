"use client";

import { useActionState, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { resetPassword, type AuthState } from "@/lib/actions/auth";
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

type SessionState = "loading" | "ready" | "missing";

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    resetPassword,
    undefined,
  );
  const [sessionState, setSessionState] = useState<SessionState>("loading");

  // /auth/confirm verified the recovery OTP and set cookies before
  // redirecting here. We just confirm a session exists; missing session
  // means the link expired or was opened in a different browser.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setSessionState(data.user ? "ready" : "missing");
    };

    check();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        check();
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Set a new password</CardTitle>
          <CardDescription>
            Choose a password to finish resetting your account.
          </CardDescription>
        </CardHeader>
        {sessionState === "loading" && (
          <CardContent>
            <p className="font-serif italic text-sm text-muted-foreground">
              Verifying your reset link…
            </p>
          </CardContent>
        )}
        {sessionState === "missing" && (
          <CardContent>
            <p role="alert" className="text-sm text-destructive">
              This reset link is no longer valid. Request a fresh one from the
              sign-in page.
            </p>
          </CardContent>
        )}
        {sessionState === "ready" && (
          <form action={action}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                />
                {state?.fieldErrors?.password?.map((msg) => (
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
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Saving…" : "Save new password"}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </main>
  );
}
