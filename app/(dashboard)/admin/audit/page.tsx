import Link from "next/link";
import { listRecentAudit } from "@/lib/queries/audit";
import { Card, CardContent } from "@/components/ui/card";
import { absoluteTime, relativeTime } from "@/lib/format";

// Human-readable labels for known audit actions. New AuditAction values
// in lib/audit.ts should get an entry here so the page never shows a
// raw snake_case string.
const ACTION_LABELS: Record<string, string> = {
  business_created: "Business created",
  business_updated: "Business updated",
  business_logo_updated: "Logo updated",
  business_logo_cleared: "Logo cleared",
  campaign_created: "Campaign created",
  owner_invited: "Owner invited",
  owner_removed: "Owner removed",
};

function labelFor(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function metadataPreview(m: Record<string, unknown>): string {
  const entries = Object.entries(m);
  if (entries.length === 0) return "";
  // Trim to keep table cells legible; full row stays queryable in Supabase.
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ")
    .slice(0, 140);
}

export default async function AdminAuditPage() {
  const entries = await listRecentAudit(100);

  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/admin"
          className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          ← Back to admin
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          The 100 most recent platform-significant actions — business
          creates and edits, campaign creates, and owner moves. Funnel
          and feedback events are not tracked here; use the analytics
          dashboard for those.
        </p>
      </header>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-serif italic text-base text-muted-foreground max-w-md mx-auto">
              No audit entries yet. Actions performed from now on will
              show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Restaurant</th>
                <th className="px-4 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
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
                  <td className="px-4 py-3">
                    {e.businessId ? (
                      <Link
                        href={`/admin/restaurants/${e.businessId}`}
                        className="hover:underline"
                      >
                        {e.businessName ?? "(deleted)"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
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
      )}
    </div>
  );
}
