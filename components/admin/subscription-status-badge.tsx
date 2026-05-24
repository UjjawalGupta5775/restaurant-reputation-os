import type {
  AccessReason,
  SubscriptionStatus,
} from "@/lib/billing/state";
import { cn } from "@/lib/utils";

// Tiny badge for the admin business grid + business detail header.
// Reflects both the raw status and the access verdict — a 'canceled'
// row inside its grace window reads differently from one that's expired.

type Props = {
  status: SubscriptionStatus | null;
  reason: AccessReason;
  className?: string;
};

function labelFor(status: SubscriptionStatus | null, reason: AccessReason) {
  if (status === null) return "No subscription";
  if (reason === "admin_override") return "Override";
  if (status === "trialing") return "Trialing";
  if (status === "active") return "Active";
  if (status === "past_due") {
    return reason === "past_due_grace" ? "Past due (grace)" : "Past due";
  }
  if (status === "canceled") {
    return reason === "cancel_grace" ? "Cancel scheduled" : "Canceled";
  }
  return status;
}

function toneFor(reason: AccessReason) {
  switch (reason) {
    case "admin_override":
    case "active":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "trial":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "past_due_grace":
    case "cancel_grace":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "expired":
    case "no_subscription":
      return "bg-rose-100 text-rose-800 border-rose-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function SubscriptionStatusBadge({ status, reason, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        toneFor(reason),
        className,
      )}
    >
      {labelFor(status, reason)}
    </span>
  );
}
