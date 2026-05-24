import Link from "next/link";

// Aggregate billing strip for owners with multiple businesses needing
// attention. Rendered at the top of /dashboard when 2+ businesses have
// an actionable billing banner. Single-business attention still uses
// the full BillingBanner (with CTA) — drilling into one business for
// one fix is fine. The aggregate form prevents the dashboard from being
// a stack of 4 amber bars when an owner with 6 locations has 3 cards
// failing simultaneously.

type Props = {
  count: number;
};

export function OwnerBillingAttentionSummary({ count }: Props) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-l-2 border-l-amber-500 bg-card px-4 py-3"
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">
          {count} businesses need billing attention
        </p>
        <p className="text-sm text-muted-foreground">
          Review each one&apos;s status and fix payment or subscription issues.
        </p>
      </div>
      <Link
        href="/dashboard/billing"
        className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent"
      >
        Review billing →
      </Link>
    </div>
  );
}
