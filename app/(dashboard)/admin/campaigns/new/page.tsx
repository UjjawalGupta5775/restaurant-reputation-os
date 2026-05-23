import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusinessByIdForOwner } from "@/lib/queries/businesses";
import { CampaignForm } from "@/components/dashboard/campaign-form";

export default async function AdminNewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const { businessId } = await searchParams;
  if (!businessId) notFound();

  const business = await getBusinessByIdForOwner(businessId);
  if (!business) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href={`/admin/restaurants/${business.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to {business.name}
        </Link>
      </div>
      <CampaignForm businessId={business.id} scope="admin" />
    </div>
  );
}
