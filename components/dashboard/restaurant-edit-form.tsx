"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  updateBusiness,
  type BusinessFormState,
} from "@/lib/actions/businesses";
import { Button, buttonVariants } from "@/components/ui/button";
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

type Defaults = {
  id: string;
  name: string;
  slug: string;
  google_review_url: string | null;
  google_place_id: string | null;
};

export function RestaurantEditForm({
  defaults,
  scope = "owner",
}: {
  defaults: Defaults;
  scope?: "admin" | "owner";
}) {
  const [state, action, pending] = useActionState<BusinessFormState, FormData>(
    updateBusiness,
    undefined,
  );

  const backHref =
    scope === "admin"
      ? `/admin/restaurants/${defaults.id}`
      : `/dashboard/restaurants/${defaults.id}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Edit restaurant</CardTitle>
        <CardDescription>
          The public link slug is fixed once a restaurant is created — printed
          QRs already point at it.
        </CardDescription>
      </CardHeader>
      <form action={action}>
        <input type="hidden" name="id" value={defaults.id} />
        <input type="hidden" name="scope" value={scope} />
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Public link</Label>
            <p className="font-mono text-sm text-muted-foreground">
              /r/{defaults.slug}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Restaurant name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="off"
              maxLength={120}
              defaultValue={defaults.name}
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
              defaultValue={defaults.google_review_url ?? ""}
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
              defaultValue={defaults.google_place_id ?? ""}
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
        <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link
            href={backHref}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Cancel
          </Link>
          <Button
            type="submit"
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
