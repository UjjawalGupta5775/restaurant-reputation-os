import { notFound } from "next/navigation";
import { getBusinessBySlugPublic } from "@/lib/queries/businesses";
import { getActiveCampaignBySlugPublic } from "@/lib/queries/campaigns";
import {
  getChipSettings,
  listActiveChipsForCustomer,
} from "@/lib/queries/review-chips";
import { getOperationalStatusPublic } from "@/lib/queries/subscriptions";
import { recordPausedView } from "@/lib/funnel/paused-view";
import { CustomerFunnel } from "@/components/funnel/customer-funnel";
import { PausedRestaurantNotice } from "@/components/funnel/paused-restaurant-notice";

export default async function PublicRestaurantPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { slug } = await params;
  const { c: campaignSlug } = await searchParams;

  const business = await getBusinessBySlugPublic(slug);
  if (!business) notFound();

  // Subscription gate. If the restaurant isn't on an operational plan
  // (lapsed trial with no card, payment failed past grace, canceled
  // past grace), render a calm "reviews paused" notice instead of the
  // full funnel. We deliberately do NOT 404 — a missing-page interstitial
  // would look broken to a customer at the table. The notice tells them
  // nothing is wrong with the restaurant, just that this surface isn't
  // active right now.
  const access = await getOperationalStatusPublic(business.id);
  if (!access.ok) {
    // Fire-and-forget observability event so we can measure how often
    // a real customer hits the pause wall. Awaiting would add latency
    // to the customer's render for no benefit; failures land in Sentry
    // via the helper.
    void recordPausedView({ businessId: business.id, reason: access.reason });
    return (
      <main className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center px-4 py-8">
        <PausedRestaurantNotice
          businessName={business.name}
          logoUrl={business.logo_url}
        />
      </main>
    );
  }

  const campaign = campaignSlug
    ? await getActiveCampaignBySlugPublic(business.id, campaignSlug)
    : null;

  if (campaignSlug && !campaign) notFound();

  const [chips, chipSettings] = await Promise.all([
    listActiveChipsForCustomer(business.id),
    getChipSettings(business.id),
  ]);

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center px-4 py-8">
      <CustomerFunnel
        business={{
          id: business.id,
          name: business.name,
          google_review_url: business.google_review_url,
          logo_url: business.logo_url,
        }}
        campaign={campaign ? { id: campaign.id, slug: campaign.slug } : null}
        chips={chips}
        chipDisplayMode={chipSettings.displayMode}
        chipDisplayLimit={chipSettings.displayLimit}
      />
    </main>
  );
}
