"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
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

function DeactivatedNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get("deactivated") !== "1") return null;
  return (
    <p
      role="status"
      className="rounded-md border border-l-2 border-l-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      Your account has been deactivated. Contact support if this is a mistake.
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
            Business owners and admins — sign in to access your dashboard.
          </CardDescription>
        </CardHeader>
        <form action={action}>
          <CardContent className="space-y-4">
            <Suspense fallback={null}>
              <DeactivatedNotice />
            </Suspense>
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
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
            <div className="flex w-full items-center justify-between gap-3 text-sm">
              <Link
                href="/auth/forgot-password"
                className="text-muted-foreground hover:underline"
              >
                Forgot password?
              </Link>
              <Link
                href="/auth/signup"
                className="text-muted-foreground hover:underline"
              >
                Create an account
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
