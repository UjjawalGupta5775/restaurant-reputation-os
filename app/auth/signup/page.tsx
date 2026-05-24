"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthState } from "@/lib/actions/auth";
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

export default function SignupPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signUp,
    undefined,
  );

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Create an account</CardTitle>
          <CardDescription>
            Sign up to create your business and start collecting reviews
            and private feedback.
          </CardDescription>
        </CardHeader>
        <form action={action}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="restaurantName">Business name</Label>
              <Input
                id="restaurantName"
                name="restaurantName"
                type="text"
                autoComplete="organization"
                required
                maxLength={120}
                placeholder="e.g. The Curry Pot"
              />
              {state?.fieldErrors?.restaurantName?.map((msg) => (
                <p key={msg} role="alert" className="text-sm text-destructive">
                  {msg}
                </p>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Your email</Label>
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
            {state?.info && (
              <p
                role="status"
                className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground"
              >
                {state.info}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Creating account…" : "Create account"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/auth/login"
                className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
