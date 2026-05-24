import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/dal";
import { getBusinessByIdForOwner } from "@/lib/queries/businesses";
import { getSubscriptionForBusiness } from "@/lib/queries/subscriptions";
import { describeSubscription } from "@/lib/billing/status";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

// Read-only billing view for support. Intentionally does NOT expose the
// "Manage billing" CTA — opening a customer portal session on behalf of
// another account would either fail (LS portal binds to the customer's
// email) or, worse, succeed silently and give an admin direct access to
// the owner's payment methods. If a real action is needed (e.g. extend
// trial), it should be a deliberate admin-only RPC, not a hidden hijack.
export default async function AdminBillingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;

  const business = await getBusinessByIdForOwner(id);
  if (!business) notFound();

  const subscription = await getSubscriptionForBusiness(id);
  const summary = describeSubscription(subscription);

  // Format raw fields ourselves so admin sees actual ISO timestamps —
  // useful for "we got a Stripe email at 14:32 UTC, can you confirm…"
  // support conversations the owner-facing copy hides.
  const renderTimestamp = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
  };

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/admin/restaurants/${business.id}`}
          className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          ← Back to {business.name}
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Read-only view of {business.name}&apos;s subscription. Manage actions
          live in the owner&apos;s account by design — Lemon Squeezy&apos;s
          portal is scoped to the customer&apos;s email.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Current state</CardTitle>
          <CardDescription>
            What the owner sees on their own billing page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Raw record</CardTitle>
          <CardDescription>
            Fields from the subscriptions row — useful for cross-referencing
            with Lemon Squeezy support cases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Field label="Provider" value={subscription.provider} />
              <Field label="Status (raw)" value={subscription.status} />
              <Field
                label="Provider customer ID"
                value={subscription.providerCustomerId ?? "—"}
              />
              <Field
                label="Provider subscription ID"
                value={subscription.providerSubscriptionId ?? "—"}
              />
              <Field
                label="Trial ends at"
                value={renderTimestamp(subscription.trialEndsAt)}
              />
              <Field
                label="Current period ends at"
                value={renderTimestamp(subscription.currentPeriodEndsAt)}
              />
              <Field
                label="Grace until"
                value={renderTimestamp(subscription.graceUntil)}
              />
              <Field
                label="Admin override until"
                value={renderTimestamp(subscription.adminOverrideUntil)}
              />
              <Field
                label="Cancel at"
                value={renderTimestamp(subscription.cancelAt)}
              />
              <Field
                label="Canceled at"
                value={renderTimestamp(subscription.canceledAt)}
              />
              <Field
                label="Created at"
                value={renderTimestamp(subscription.createdAt)}
              />
              <Field
                label="Updated at"
                value={renderTimestamp(subscription.updatedAt)}
              />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              No subscription row exists yet — owner hasn&apos;t started
              checkout or trial.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="break-all font-mono text-xs">{value}</dd>
    </div>
  );
}
