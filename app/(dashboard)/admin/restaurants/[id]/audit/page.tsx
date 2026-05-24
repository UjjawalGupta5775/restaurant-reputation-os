import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusinessByIdForOwner } from "@/lib/queries/businesses";
import { listAuditForBusiness } from "@/lib/queries/audit";
import { Card, CardContent } from "@/components/ui/card";
import { absoluteTime, relativeTime } from "@/lib/format";

// Per-restaurant audit log. Mirrors the column shape of /admin/audit
// (the global view) but with a single-business filter, pagination, and
// no Restaurant column (it's redundant on a per-restaurant page).
//
// Why this exists separately from /admin/audit
// --------------------------------------------
// The global view is the "what just happened across the platform"
// firehose — useful for spotting incidents, NOT for support cases. When
// a customer or owner files a ticket about restaurant X, the operator
// wants every action on X in chronological order, paginated. That's
// this page.

const ACTION_LABELS: Record<string, string> = {
  business_created: "Business created",
  business_updated: "Business updated",
  business_logo_updated: "Logo updated",
  business_logo_cleared: "Logo cleared",
  campaign_created: "Campaign created",
  owner_invited: "Owner invited",
  owner_removed: "Owner removed",
  subscription_created: "Subscription created",
  subscription_updated: "Subscription updated",
  subscription_canceled: "Subscription canceled",
  subscription_resumed: "Subscription resumed",
  subscription_expired: "Subscription expired",
  subscription_paused: "Subscription paused",
  subscription_unpaused: "Subscription unpaused",
  subscription_payment_failed: "Payment failed",
  subscription_payment_recovered: "Payment recovered",
  subscription_admin_override_set: "Admin override set",
  subscription_admin_override_cleared: "Admin override cleared",
};

function labelFor(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function metadataPreview(m: Record<string, unknown>): string {
  const entries = Object.entries(m);
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ")
    .slice(0, 200);
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 1000);
}

export default async function AdminRestaurantAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);

  const business = await getBusinessByIdForOwner(id);
  if (!business) notFound();

  const entries = await listAuditForBusiness(id, { page, pageSize: 50 });

  const prevHref =
    entries.page > 1
      ? `/admin/restaurants/${id}/audit${entries.page - 1 > 1 ? `?page=${entries.page - 1}` : ""}`
      : null;
  const nextHref =
    entries.page < entries.totalPages
      ? `/admin/restaurants/${id}/audit?page=${entries.page + 1}`
      : null;

  return (
    <div className="space-y-10">
      <div>
        <Link
          href={`/admin/restaurants/${id}`}
          className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          ← Back to {business.name}
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every recorded action on {business.name}, newest first. Funnel and
          feedback events are not tracked here — use the analytics view for
          those.
        </p>
      </header>

      {entries.rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-serif italic text-base text-muted-foreground max-w-md mx-auto">
              No audit entries yet for this restaurant.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {entries.rows.map((e) => (
                  <tr key={e.id} className="border-b last:border-b-0 align-top">
                    <td
                      className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground"
                      title={absoluteTime(e.createdAt)}
                    >
                      {relativeTime(e.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {labelFor(e.action)}
                    </td>
                    <td className="px-4 py-3">
                      {e.actorEmail ? (
                        e.actorEmail
                      ) : e.actorUserId ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {e.actorUserId.slice(0, 8)}…
                        </span>
                      ) : (
                        <span className="text-muted-foreground">system</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {metadataPreview(e.metadata)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {entries.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <p className="text-muted-foreground">
                Page <span className="tabular-nums">{entries.page}</span> of{" "}
                <span className="tabular-nums">{entries.totalPages}</span> ·{" "}
                <span className="tabular-nums">{entries.total}</span> total
              </p>
              <div className="flex items-center gap-2">
                {prevHref ? (
                  <Link
                    href={prevHref}
                    className="rounded-md border px-3 py-1 hover:bg-accent"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span className="rounded-md border px-3 py-1 text-muted-foreground/60">
                    ← Previous
                  </span>
                )}
                {nextHref ? (
                  <Link
                    href={nextHref}
                    className="rounded-md border px-3 py-1 hover:bg-accent"
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="rounded-md border px-3 py-1 text-muted-foreground/60">
                    Next →
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
