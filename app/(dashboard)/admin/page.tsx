import Link from "next/link";
import {
  listAllBusinessesAdmin,
  type AdminBusinessStatusFilter,
} from "@/lib/queries/businesses";
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
import { AdminRestaurantListControls } from "@/components/admin/restaurant-list-controls";
import { AdminRestaurantListPagination } from "@/components/admin/restaurant-list-pagination";
import { SubscriptionStatusBadge } from "@/components/admin/subscription-status-badge";

const VALID_STATUSES: ReadonlyArray<AdminBusinessStatusFilter> = [
  "all",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "no_subscription",
];

function parseStatusFilter(raw: string | undefined): AdminBusinessStatusFilter {
  if (!raw) return "all";
  return (VALID_STATUSES as readonly string[]).includes(raw)
    ? (raw as AdminBusinessStatusFilter)
    : "all";
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 1000);
}

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    q?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const {
    period: periodParam,
    q: searchParam,
    status: statusParam,
    page: pageParam,
  } = await searchParams;

  const period = parsePeriod(periodParam);
  const label = periodLabel(period);
  const search = (searchParam ?? "").slice(0, 120);
  const status = parseStatusFilter(statusParam);
  const page = parsePage(pageParam);

  const [businessesPage, kpis, daily] = await Promise.all([
    listAllBusinessesAdmin({ search, status, page }),
    getPlatformKpis(period),
    getPlatformDailyScans(period),
  ]);

  // Carried into pagination links so filter context survives next/prev.
  const baseSearchParams = {
    period: periodParam,
    q: search || undefined,
    status: status === "all" ? undefined : status,
  };

  return (
    <div className="space-y-10">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-serif text-3xl tracking-tight">All businesses</h1>
          <p className="text-sm text-muted-foreground">
            Every business on the platform. Create new ones, edit settings,
            and manage owners from here.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* /admin/feedback intentionally NOT linked here. The cross-tenant
              firehose is noise for daily admin work; per-business feedback
              lives under /admin/restaurants/[id]/feedback. The route stays
              reachable for support escalations that include a direct URL. */}
          <Link
            href="/admin/audit"
            className={buttonVariants({ variant: "outline" })}
          >
            Audit log
          </Link>
          <Link href="/admin/restaurants/new" className={buttonVariants()}>
            New business
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
        <h2 className="font-serif text-xl tracking-tight">Businesses</h2>

        <AdminRestaurantListControls
          initialSearch={search}
          currentStatus={status}
        />

        {businessesPage.rows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="font-serif italic text-base text-muted-foreground max-w-sm mx-auto">
                {search || status !== "all"
                  ? "No businesses match the current filters."
                  : "No businesses yet. Add the first one to start onboarding owners."}
              </p>
              {!search && status === "all" && (
                <div className="mt-6">
                  <Link
                    href="/admin/restaurants/new"
                    className={buttonVariants()}
                  >
                    Add first business
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {businessesPage.rows.map((b) => (
                <Link
                  key={b.id}
                  href={`/admin/restaurants/${b.id}`}
                  className="block"
                >
                  <Card className="h-full transition-colors hover:bg-accent/40">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="truncate font-serif text-xl">
                            {b.name}
                          </CardTitle>
                          <CardDescription className="font-mono text-xs">
                            /r/{b.slug}
                          </CardDescription>
                        </div>
                        <SubscriptionStatusBadge
                          status={b.subscriptionStatus}
                          reason={b.accessReason}
                          className="shrink-0"
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      <span className="tabular-nums">{b.campaignCount}</span>{" "}
                      {b.campaignCount === 1 ? "campaign" : "campaigns"}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            <AdminRestaurantListPagination
              page={businessesPage.page}
              totalPages={businessesPage.totalPages}
              total={businessesPage.total}
              pageSize={businessesPage.pageSize}
              baseSearchParams={baseSearchParams}
            />
          </>
        )}
      </section>
    </div>
  );
}
