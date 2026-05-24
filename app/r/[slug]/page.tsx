import { notFound } from "next/navigation";
import { getBusinessBySlugPublic } from "@/lib/queries/businesses";
import { getActiveCampaignBySlugPublic } from "@/lib/queries/campaigns";
import {
  getChipSettings,
  listActiveChipsForCustomer,
} from "@/lib/queries/review-chips";
import { CustomerFunnel } from "@/components/funnel/customer-funnel";

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
