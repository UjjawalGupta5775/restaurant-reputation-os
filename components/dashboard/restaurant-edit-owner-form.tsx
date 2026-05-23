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
  phone: string | null;
  address: string | null;
  hours: string | null;
};

// Owner-scoped edit form. Deliberately narrower than the admin form:
// slug, Google review URL, and Google Place ID are NOT editable here.
// The server action's ownerUpdateSchema is the authoritative whitelist;
// this form is just the UI for the same set of fields.
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
          Update your restaurant&apos;s display name and the operational details
          you want to keep on file. Public link and Google review settings are
          managed by your admin.
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
