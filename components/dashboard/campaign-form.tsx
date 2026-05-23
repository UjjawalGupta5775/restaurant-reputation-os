"use client";

import { useActionState } from "react";
import {
  createCampaign,
  type CampaignFormState,
} from "@/lib/actions/campaigns";
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

const SOURCE_TYPES = [
  { value: "table", label: "Table tent" },
  { value: "counter", label: "Counter / register" },
  { value: "receipt", label: "Receipt" },
  { value: "poster", label: "Poster" },
  { value: "delivery", label: "Delivery package" },
  { value: "other", label: "Other" },
] as const;

export function CampaignForm({
  businessId,
  scope = "owner",
}: {
  businessId: string;
  scope?: "admin" | "owner";
}) {
  const [state, action, pending] = useActionState<CampaignFormState, FormData>(
    createCampaign,
    undefined,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">New campaign</CardTitle>
        <CardDescription>
          One campaign = one QR placement. Use clear names so you can tell them
          apart in analytics.
        </CardDescription>
      </CardHeader>
      <form action={action}>
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="scope" value={scope} />
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Campaign name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="off"
              maxLength={80}
              placeholder="e.g. Table 5"
            />
            {state?.fieldErrors?.name?.map((msg) => (
              <p key={msg} role="alert" className="text-sm text-destructive">
                {msg}
              </p>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sourceType">Source type</Label>
            <select
              id="sourceType"
              name="sourceType"
              required
              defaultValue="table"
              className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {SOURCE_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {state?.fieldErrors?.sourceType?.map((msg) => (
              <p key={msg} role="alert" className="text-sm text-destructive">
                {msg}
              </p>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tableCode">
                Table code{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="tableCode"
                name="tableCode"
                type="text"
                autoComplete="off"
                maxLength={40}
                placeholder="5"
              />
              {state?.fieldErrors?.tableCode?.map((msg) => (
                <p key={msg} role="alert" className="text-sm text-destructive">
                  {msg}
                </p>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="staffCode">
                Staff code{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="staffCode"
                name="staffCode"
                type="text"
                autoComplete="off"
                maxLength={40}
                placeholder="AM"
              />
              {state?.fieldErrors?.staffCode?.map((msg) => (
                <p key={msg} role="alert" className="text-sm text-destructive">
                  {msg}
                </p>
              ))}
            </div>
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
            {pending ? "Creating…" : "Create campaign"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
