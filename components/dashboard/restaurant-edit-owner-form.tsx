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
import { Textarea } from "@/components/ui/textarea";
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
  phone: string | null;
  address: string | null;
  hours: string | null;
};

// Owner-scoped edit form. The slug stays admin-only (printed QRs depend
// on it). Google review URL and Place ID ARE owner-editable — they need
// to be, since self-serve signups land with both unset. The server
// action's ownerUpdateSchema is the authoritative field whitelist.
export function RestaurantEditOwnerForm({ defaults }: { defaults: Defaults }) {
  const [state, action, pending] = useActionState<BusinessFormState, FormData>(
    updateBusiness,
    undefined,
  );

  const backHref = `/dashboard/restaurants/${defaults.id}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Edit details</CardTitle>
        <CardDescription>
          Update your business&apos;s display name, Google review link, and
          operational details. The public link slug is fixed once a business
          is created — printed QRs already point at it.
        </CardDescription>
      </CardHeader>
      <form action={action}>
        <input type="hidden" name="id" value={defaults.id} />
        <input type="hidden" name="scope" value="owner" />
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Public link</Label>
            <p className="font-mono text-sm text-muted-foreground">
              /r/{defaults.slug}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Business name</Label>
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
            <p className="text-xs text-muted-foreground">
              Find this in your Google Business Profile → &ldquo;Get more
              reviews&rdquo; → copy the share link. Customers who tap
              &ldquo;Leave a Google review&rdquo; will land here.
            </p>
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
            <p className="text-xs text-muted-foreground">
              Optional. Used internally to identify your business on Google
              Maps. Find it via Google&apos;s Place ID Finder if your URL
              doesn&apos;t include one.
            </p>
            {state?.fieldErrors?.googlePlaceId?.map((msg) => (
              <p key={msg} role="alert" className="text-sm text-destructive">
                {msg}
              </p>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">
              Phone <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="off"
              maxLength={40}
              placeholder="+91 98765 43210"
              defaultValue={defaults.phone ?? ""}
            />
            {state?.fieldErrors?.phone?.map((msg) => (
              <p key={msg} role="alert" className="text-sm text-destructive">
                {msg}
              </p>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">
              Address <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="address"
              name="address"
              autoComplete="off"
              maxLength={240}
              placeholder="Street, area, city"
              defaultValue={defaults.address ?? ""}
              className="min-h-20"
            />
            {state?.fieldErrors?.address?.map((msg) => (
              <p key={msg} role="alert" className="text-sm text-destructive">
                {msg}
              </p>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="hours">
              Hours <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="hours"
              name="hours"
              autoComplete="off"
              maxLength={240}
              placeholder="Mon–Fri 11am–10pm, Sat–Sun 10am–11pm"
              defaultValue={defaults.hours ?? ""}
              className="min-h-20"
            />
            {state?.fieldErrors?.hours?.map((msg) => (
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
