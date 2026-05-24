import Link from "next/link";
import { listAllBusinesses } from "@/lib/queries/businesses";
import {
  getPlatformDailyScans,
  getPlatformKpis,
} from "@/lib/queries/analytics";
import { parsePeriod, periodLabel } from "@/lib/queries/period";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { DailyScansChart } from "@/components/dashboard/daily-scans-chart";
import { AnalyticsPeriodPicker } from "@/components/dashboard/analytics-period-picker";

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const period = parsePeriod(periodParam);
  const label = periodLabel(period);

  const [businesses, kpis, daily] = await Promise.all([
    listAllBusinesses(),
    getPlatformKpis(period),
    getPlatformDailyScans(period),
  ]);

  return (
    <div className="space-y-10">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-serif text-3xl tracking-tight">All restaurants</h1>
          <p className="text-sm text-muted-foreground">
            Every restaurant on the platform. Create new ones, edit settings,
            and manage owners from here.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/feedback"
            className={buttonVariants({ variant: "outline" })}
          >
            Feedback
          </Link>
          <Link
            href="/admin/audit"
            className={buttonVariants({ variant: "outline" })}
          >
            Audit log
          </Link>
          <Link href="/admin/restaurants/new" className={buttonVariants()}>
            New restaurant
          </Link>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl tracking-tight">Platform analytics</h2>
          <AnalyticsPeriodPicker />
        </div>
        <KpiStrip kpis={kpis} periodLabel={label} />
        <DailyScansChart data={daily} periodLabel={label} />
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-xl tracking-tight">Restaurants</h2>
        {businesses.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="font-serif italic text-base text-muted-foreground max-w-sm mx-auto">
                No restaurants yet. Add the first one to start onboarding owners.
              </p>
              <div className="mt-6">
                <Link
                  href="/admin/restaurants/new"
                  className={buttonVariants()}
                >
                  Add first restaurant
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.map((b) => (
              <Link
                key={b.id}
                href={`/admin/restaurants/${b.id}`}
                className="block"
              >
                <Card className="h-full transition-colors hover:bg-accent/40">
                  <CardHeader>
                    <CardTitle className="truncate font-serif text-xl">
                      {b.name}
                    </CardTitle>
                    <CardDescription className="font-mono text-xs">
                      /r/{b.slug}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    <span className="tabular-nums">{b.campaignCount}</span>{" "}
                    {b.campaignCount === 1 ? "campaign" : "campaigns"}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
