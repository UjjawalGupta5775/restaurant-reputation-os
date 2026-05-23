import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessAccess } from "@/lib/dal";
import { getBusinessByIdForOwner } from "@/lib/queries/businesses";
import { listCampaignsForBusiness } from "@/lib/queries/campaigns";
import {
  getDailyScans,
  getRestaurantKpis,
} from "@/lib/queries/analytics";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { FunnelBars } from "@/components/dashboard/funnel-bars";
import { DailyScansChart } from "@/components/dashboard/daily-scans-chart";

export default async function RestaurantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireBusinessAccess(id);

  const business = await getBusinessByIdForOwner(id);
  if (!business) notFound();

  const [campaigns, kpis, daily] = await Promise.all([
    listCampaignsForBusiness(id),
    getRestaurantKpis(id),
    getDailyScans(id),
  ]);

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-serif text-3xl tracking-tight">
            {business.name}
          </h1>
          <div className="flex items-center gap-3 text-sm">
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
        <KpiStrip kpis={kpis} />
        <div className="grid gap-4 lg:grid-cols-2">
          <FunnelBars
            scans={kpis.thirtyDayScans}
            ratings={kpis.thirtyDayRatings}
            googleClicks={kpis.thirtyDayGoogleClicks}
            feedback={kpis.thirtyDayFeedback}
          />
          <DailyScansChart data={daily} />
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-serif text-xl tracking-tight">Campaigns</h2>
          <p className="text-sm text-muted-foreground">
            Each campaign is a QR placement. Your admin manages campaigns.
          </p>
        </div>

        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="font-serif italic text-base text-muted-foreground max-w-sm mx-auto">
                No campaigns yet. Your admin will add QR placements here.
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
