import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessAccess } from "@/lib/dal";
import { getBusinessByIdForOwner } from "@/lib/queries/businesses";
import { getSubscriptionForBusiness } from "@/lib/queries/subscriptions";
import { describeSubscription } from "@/lib/billing/status";
import { deriveBanner } from "@/lib/billing/state";
import { openCustomerPortal, startCheckout } from "@/lib/actions/billing";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BillingBanner } from "@/components/dashboard/billing-banner";

export const dynamic = "force-dynamic";

const toneBadge: Record<
  ReturnType<typeof describeSubscription>["badge"]["tone"],
  string
> = {
  neutral: "bg-muted text-foreground",
  info: "bg-muted text-foreground",
  warn: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  critical: "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200",
};

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;

  await requireBusinessAccess(id);
  const business = await getBusinessByIdForOwner(id);
  if (!business) notFound();

  const subscription = await getSubscriptionForBusiness(id);
  const summary = describeSubscription(subscription);
  const banner = deriveBanner(subscription);
  const returnPath = `/dashboard/restaurants/${business.id}/billing`;

  // Back link follows ?from= when it points to a same-site path. Lets
  // visitors who arrived from /dashboard/settings/billing land back on
  // that list page instead of being dumped on the restaurant detail.
  const safeFrom =
    from && from.startsWith("/") && !from.startsWith("//") ? from : null;
  const backHref = safeFrom ?? `/dashboard/restaurants/${business.id}`;
  const backLabel = safeFrom === "/dashboard/settings/billing"
    ? "Back to Billing settings"
    : `Back to ${business.name}`;

  const ctaAction =
    summary.primaryCta.kind === "portal"
      ? openCustomerPortal.bind(null, business.id, returnPath)
      : startCheckout.bind(null, business.id, returnPath);

  return (
    <div className="space-y-8">
      <div className="text-sm">
        <Link
          href={backHref}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← {backLabel}
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your subscription for {business.name}.
        </p>
      </header>

      {banner && (
        <BillingBanner
          banner={banner}
          businessId={business.id}
          returnPath={returnPath}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Current plan</CardTitle>
          <CardDescription>
            Updates flow in automatically from Lemon Squeezy after any change.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneBadge[summary.badge.tone]}`}
            >
              {summary.badge.label}
            </span>
            {summary.dateLine && (
              <p className="text-sm text-muted-foreground">{summary.dateLine}</p>
            )}
            {summary.paymentMethodLine && (
              <p className="text-sm text-muted-foreground">
                Payment method on file: {summary.paymentMethodLine}
              </p>
            )}
          </div>

          <form action={ctaAction}>
            <Button type="submit">{summary.primaryCta.label}</Button>
          </form>

          <p className="text-xs text-muted-foreground leading-relaxed max-w-prose">
            {summary.primaryCta.kind === "portal"
              ? "Opens the secure Lemon Squeezy customer portal where you can update your card, view past invoices, change billing email, or cancel."
              : "Opens a secure checkout to add a payment method. We never store your card details — Lemon Squeezy handles payment."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
