import Link from "next/link";
import { listBusinessesForOwner } from "@/lib/queries/businesses";
import { getSubscriptionForBusiness } from "@/lib/queries/subscriptions";
import { describeSubscription } from "@/lib/billing/status";
import { deriveBanner } from "@/lib/billing/state";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BillingBanner } from "@/components/dashboard/billing-banner";

export const dynamic = "force-dynamic";

const toneBadge = {
  neutral: "bg-muted text-foreground",
  info: "bg-muted text-foreground",
  warn: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  critical: "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200",
} as const;

export default async function SettingsBillingPage() {
  const businesses = await listBusinessesForOwner();

  if (businesses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">No restaurants yet</CardTitle>
          <CardDescription>
            Create a restaurant first — billing kicks in per restaurant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/dashboard"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Go to dashboard
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Per-restaurant subscriptions: fetch each in parallel. Small fan-out is
  // fine — owners typically have a handful of restaurants, and each query
  // is a single-row PK lookup gated by RLS.
  const rows = await Promise.all(
    businesses.map(async (b) => {
      const subscription = await getSubscriptionForBusiness(b.id);
      return {
        business: b,
        subscription,
        summary: describeSubscription(subscription),
        banner: deriveBanner(subscription),
      };
    }),
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Each restaurant has its own subscription. Manage card, plan, or
        cancel from the per-restaurant billing page.
      </p>

      <div className="space-y-3">
        {rows.map(({ business, summary, banner }) => {
          const returnPath = "/dashboard/settings/billing";
          return (
            <div
              key={business.id}
              className="space-y-3 rounded-lg border bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-serif text-lg tracking-tight">
                    {business.name}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${toneBadge[summary.badge.tone]}`}
                    >
                      {summary.badge.label}
                    </span>
                    {summary.dateLine && (
                      <span className="text-xs text-muted-foreground">
                        {summary.dateLine}
                      </span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/dashboard/restaurants/${business.id}/billing?from=/dashboard/settings/billing`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Manage
                </Link>
              </div>

              {banner && (
                <BillingBanner
                  banner={banner}
                  businessId={business.id}
                  returnPath={returnPath}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
