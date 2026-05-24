import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { requireBusinessAccess } from "@/lib/dal";
import {
  getBusinessByIdForOwner,
  listBusinessesForOwner,
} from "@/lib/queries/businesses";
import { listCampaignsForBusiness } from "@/lib/queries/campaigns";
import {
  getDailyScans,
  getFunnelTiming,
  getRestaurantKpis,
} from "@/lib/queries/analytics";
import { parsePeriod, periodLabel } from "@/lib/queries/period";
import { getSubscriptionForBusiness } from "@/lib/queries/subscriptions";
import { deriveBanner } from "@/lib/billing/state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { FunnelBars } from "@/components/dashboard/funnel-bars";
import { DailyScansChart } from "@/components/dashboard/daily-scans-chart";
import { FunnelSpeed } from "@/components/dashboard/funnel-speed";
import { AnalyticsPeriodPicker } from "@/components/dashboard/analytics-period-picker";
import { RestaurantSwitcher } from "@/components/dashboard/restaurant-switcher";
import { BillingBanner } from "@/components/dashboard/billing-banner";

export default async function RestaurantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { id } = await params;
  const { period: periodParam } = await searchParams;
  const period = parsePeriod(periodParam);
  const label = periodLabel(period);

  await requireBusinessAccess(id);

  const business = await getBusinessByIdForOwner(id);
  if (!business) notFound();

  const [campaigns, kpis, daily, timing, restaurants, subscription] =
    await Promise.all([
      listCampaignsForBusiness(id),
      getRestaurantKpis(id, period),
      getDailyScans(id, period),
      getFunnelTiming(id, period),
      listBusinessesForOwner(),
      getSubscriptionForBusiness(id),
    ]);
  const banner = deriveBanner(subscription);

  return (
    <div className="space-y-10">
      {banner && (
        <BillingBanner
          banner={banner}
          businessId={business.id}
          returnPath={`/dashboard/restaurants/${business.id}`}
        />
      )}

      <div>
        <RestaurantSwitcher
          restaurants={restaurants}
          currentBusinessId={business.id}
        />
      </div>

      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {business.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={business.logo_url}
                alt=""
                className="size-12 rounded-md border object-cover"
              />
            )}
            <h1 className="font-serif text-3xl tracking-tight">
              {business.name}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href={`/dashboard/restaurants/${business.id}/edit`}
              className="rounded-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
            >
              Edit details
            </Link>
            <Link
              href={`/dashboard/restaurants/${business.id}/billing`}
              className="rounded-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
            >
              Billing
            </Link>
            <Link
              href={`/dashboard/restaurants/${business.id}/feedback`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Feedback
            </Link>
          </div>
        </div>
        <p className="font-mono text-sm text-muted-foreground">
          /r/{business.slug}
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl tracking-tight">Analytics</h2>
          <AnalyticsPeriodPicker />
        </div>
        <KpiStrip kpis={kpis} periodLabel={label} />
        <div className="grid gap-4 lg:grid-cols-2">
          <FunnelBars
            scans={kpis.windowScans}
            ratings={kpis.windowRatings}
            googleClicks={kpis.windowGoogleClicks}
            feedback={kpis.windowFeedback}
            periodLabel={label}
          />
          <DailyScansChart data={daily} periodLabel={label} />
        </div>
        <FunnelSpeed timing={timing} periodLabel={label} />
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-serif text-xl tracking-tight">Campaigns</h2>
            <p className="text-sm text-muted-foreground">
              Each campaign is a QR placement for a specific spot in your
              restaurant.
            </p>
          </div>
          <Link
            href={`/dashboard/restaurants/${business.id}/campaigns/new`}
            className={buttonVariants({ variant: "default" })}
          >
            <Plus aria-hidden className="size-4" />
            New campaign
          </Link>
        </div>

        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="font-serif italic text-base text-muted-foreground max-w-sm mx-auto">
                No campaigns yet. Add your first one to generate a QR for a
                placement.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Active</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/campaigns/${c.id}`}
                        className="rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
                      >
                        {c.name}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">
                        ?c={c.slug}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize">{c.source_type}</td>
                    <td className="px-4 py-3">{c.is_active ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
