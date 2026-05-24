"use client";

import { useActionState } from "react";
import {
  removeOwner,
  type OwnerActionState,
} from "@/lib/actions/owners";
import { Button } from "@/components/ui/button";

export function OwnerRemoveButton({
  businessId,
  userId,
  email,
}: {
  businessId: string;
  userId: string;
  email: string | null;
}) {
  const [, action, pending] = useActionState<OwnerActionState, FormData>(
    removeOwner,
    undefined,
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `Remove ${email ?? "this owner"} from this business? They lose dashboard access immediately.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="userId" value={userId} />
      <Button
        type="submit"
        disabled={pending}
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
      >
        {pending ? "Removing…" : "Remove"}
      </Button>
    </form>
  );
}
