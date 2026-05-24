import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/dal";
import { listBusinessesForOwner } from "@/lib/queries/businesses";
import { getSubscriptionForBusiness } from "@/lib/queries/subscriptions";
import { deriveBanner } from "@/lib/billing/state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OnboardingForm } from "@/components/dashboard/onboarding-form";
import { BillingBanner } from "@/components/dashboard/billing-banner";
import { OwnerBillingAttentionSummary } from "@/components/dashboard/owner-billing-attention-summary";

export default async function DashboardPage() {
  const session = await getSessionRole();
  const businesses = await listBusinessesForOwner();

  // Owner-scope rendering:
  // 0 restaurants → "no access yet" empty state (an invited owner whose
  //   admin hasn't linked them to anything yet, or a stale invite).
  // 1 restaurant → jump straight to that restaurant's analytics page.
  //   Single-property owners shouldn't need a list view.
  // 2+ restaurants → list view (multi-property operator).
  if (businesses.length === 1) {
    redirect(`/dashboard/restaurants/${businesses[0].id}`);
  }

  if (businesses.length === 0) {
    return (
      <div className="space-y-10">
        <header className="space-y-2">
          <h1 className="font-serif text-3xl tracking-tight">Welcome</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {session.email ?? session.userId}.
          </p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">
              Create your first restaurant
            </CardTitle>
            <CardDescription>
              You&apos;ll get an analytics dashboard, a QR-ready review
              funnel, and a private feedback inbox the moment you create
              it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OnboardingForm />
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          Were you invited to manage an existing restaurant? Your admin
          will link your account — once they do, refresh this page.
        </p>
      </div>
    );
  }

  // Multi-restaurant owner: surface any operational billing problems at the
  // top so they aren't trapped behind clicking into each restaurant. Healthy
  // subscriptions render nothing. Single-restaurant owners are auto-redirected
  // to their detail page above, so this banner area is multi-only.
  //
  // Display strategy:
  //   1 affected  → show the full BillingBanner with name header + CTA
  //                 (drilling into the fix from here is one click).
  //   2+ affected → show a single aggregate strip linking to
  //                 /dashboard/billing, where each restaurant's status
  //                 renders individually. Avoids the dashboard becoming
  //                 a wall of stacked amber bars.
  const banners = await Promise.all(
    businesses.map(async (b) => {
      const sub = await getSubscriptionForBusiness(b.id);
      const banner = deriveBanner(sub);
      return banner ? { business: b, banner } : null;
    }),
  );
  const activeBanners = banners.filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="space-y-10">
      {activeBanners.length === 1 && (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {activeBanners[0].business.name}
          </p>
          <BillingBanner
            banner={activeBanners[0].banner}
            businessId={activeBanners[0].business.id}
            returnPath="/dashboard"
          />
        </div>
      )}

      {activeBanners.length > 1 && (
        <OwnerBillingAttentionSummary count={activeBanners.length} />
      )}

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Your restaurants</h1>
        <p className="text-sm text-muted-foreground">
          Pick a restaurant to view its analytics, campaigns, and feedback.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {businesses.map((b) => (
          <Link
            key={b.id}
            href={`/dashboard/restaurants/${b.id}`}
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
    </div>
  );
}
