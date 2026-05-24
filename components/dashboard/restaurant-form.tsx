"use client";

import { useActionState } from "react";
import {
  createBusiness,
  type BusinessFormState,
} from "@/lib/actions/businesses";
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

export function RestaurantForm({
  scope = "owner",
}: {
  scope?: "admin" | "owner";
}) {
  const [state, action, pending] = useActionState<BusinessFormState, FormData>(
    createBusiness,
    undefined,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">New business</CardTitle>
        <CardDescription>
          The name becomes your public link slug. You can edit other details
          later.
        </CardDescription>
      </CardHeader>
      <form action={action}>
        <input type="hidden" name="scope" value={scope} />
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Business name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="off"
              maxLength={120}
              placeholder="e.g. Lighthouse Bistro"
            />
            {state?.fieldErrors?.name?.map((msg) => (
              <p key={msg} role="alert" className="text-sm text-destructive">
                {msg}
              </p>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="googleReviewUrl">
              Google review URL{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="googleReviewUrl"
              name="googleReviewUrl"
              type="url"
              autoComplete="off"
              placeholder="https://g.page/r/.../review"
            />
            {state?.fieldErrors?.googleReviewUrl?.map((msg) => (
              <p key={msg} role="alert" className="text-sm text-destructive">
                {msg}
              </p>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="googlePlaceId">
              Google Place ID{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="googlePlaceId"
              name="googlePlaceId"
              type="text"
              autoComplete="off"
              placeholder="ChIJ..."
            />
            {state?.fieldErrors?.googlePlaceId?.map((msg) => (
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
        <CardFooter className="flex justify-end">
          <Button
            type="submit"
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {pending ? "Creating…" : "Create business"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
