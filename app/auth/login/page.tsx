"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, type AuthState } from "@/lib/actions/auth";
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

const ERROR_MESSAGES: Record<string, string> = {
  invite_expired:
    "That invite link has expired or was already used. Ask your admin to send a new one.",
  auth_callback_failed:
    "Sign-in link is no longer valid. Try signing in below.",
};

function UrlError() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const urlMessage = urlError ? ERROR_MESSAGES[urlError] : null;
  if (!urlMessage) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {urlMessage}
    </p>
  );
}

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signIn,
    undefined,
  );

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Sign in</CardTitle>
          <CardDescription>
            Restaurant owners and admins — sign in to access your dashboard.
          </CardDescription>
        </CardHeader>
        <form action={action}>
          <CardContent className="space-y-4">
            <Suspense fallback={null}>
              <UrlError />
            </Suspense>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
              {state?.fieldErrors?.email?.map((msg) => (
                <p key={msg} role="alert" className="text-sm text-destructive">
                  {msg}
                </p>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
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
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
