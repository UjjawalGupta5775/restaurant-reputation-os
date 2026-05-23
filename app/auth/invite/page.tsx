"use client";

import { useActionState, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { setInvitePassword, type AuthState } from "@/lib/actions/auth";
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

export default function InvitePage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    setInvitePassword,
    undefined,
  );
  const [sessionState, setSessionState] = useState<SessionState>("loading");

  // Invite links use the implicit hash flow: the access token arrives in
  // location.hash. The browser client's detectSessionInUrl: true (default)
  // parses it and writes cookies. We poll briefly to confirm the cookie
  // session exists before exposing the password form.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let tries = 0;

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setSessionState("ready");
        return;
      }
      tries += 1;
      if (tries > 20) {
        setSessionState("missing");
        return;
      }
      setTimeout(check, 150);
    };

    check();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        setSessionState("ready");
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
          <CardTitle className="font-serif text-xl">
            Set your password
          </CardTitle>
          <CardDescription>
            Welcome aboard. Choose a password to finish setting up your account.
          </CardDescription>
        </CardHeader>
        {sessionState === "loading" && (
          <CardContent>
            <p className="font-serif italic text-sm text-muted-foreground">
              Preparing your account…
            </p>
          </CardContent>
        )}
        {sessionState === "missing" && (
          <CardContent>
            <p role="alert" className="text-sm text-destructive">
              This invite link is no longer valid. Ask your admin to send a new
              one.
            </p>
          </CardContent>
        )}
        {sessionState === "ready" && (
          <form action={action}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
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
                {pending ? "Saving…" : "Set password and continue"}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </main>
  );
}
