import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { listBusinessesForOwner } from "@/lib/queries/businesses";
import { getSubscriptionForBusiness } from "@/lib/queries/subscriptions";
import { deriveBanner, evaluateAccess } from "@/lib/billing/state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Multi-business billing summary. Reached from the aggregate strip
// on /dashboard. Single-business owners shouldn't end up here — their
// /dashboard auto-redirects to the business detail page where billing
// lives. If they navigate here directly, we still render the row but
// also redirect single-business owners straight to their billing
// surface (the goal of this page is the multi case).
export default async function OwnerBillingSummaryPage() {
  await verifySession();
  const businesses = await listBusinessesForOwner();

  if (businesses.length === 0) {
    redirect("/dashboard");
  }

  if (businesses.length === 1) {
    redirect(`/dashboard/restaurants/${businesses[0].id}/billing`);
  }

  const rows = await Promise.all(
    businesses.map(async (b) => {
      const sub = await getSubscriptionForBusiness(b.id);
      const verdict = evaluateAccess(sub);
      const banner = deriveBanner(sub);
      return { business: b, verdict, banner };
    }),
  );

  // Sort: needs-attention first, then healthy.
  rows.sort((a, b) => {
    const aPriority = a.banner ? 0 : 1;
    const bPriority = b.banner ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.business.name.localeCompare(b.business.name);
  });

  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/dashboard"
          className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          ← Back to dashboard
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Each business has its own subscription. Click through to manage
          a specific one.
        </p>
      </header>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {rows.map(({ business, verdict, banner }) => {
              const tone = banner?.tone ?? null;
              const headline =
                banner?.headline ??
                (verdict.reason === "admin_override"
                  ? "Operational (admin override)"
                  : verdict.reason === "active"
                    ? "Active subscription"
                    : "Active");

              const dotColor =
                tone === "critical"
                  ? "bg-red-500"
                  : tone === "warn"
                    ? "bg-amber-500"
                    : tone === "info"
                      ? "bg-blue-500"
                      : "bg-emerald-500";

              return (
                <li key={business.id} className="flex items-center gap-4 p-4">
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-full ${dotColor}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-serif text-lg tracking-tight">
                      {business.name}
                    </p>
                    <p className="text-sm text-muted-foreground">{headline}</p>
                    {banner?.body && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {banner.body}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/dashboard/restaurants/${business.id}/billing`}
                    className={buttonVariants({
                      variant: banner ? "default" : "outline",
                      size: "sm",
                    })}
                  >
                    {banner ? "Resolve" : "Manage"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
