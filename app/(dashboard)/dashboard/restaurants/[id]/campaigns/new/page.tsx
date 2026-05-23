import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessAccess } from "@/lib/dal";
import { getBusinessByIdForOwner } from "@/lib/queries/businesses";
import { CampaignForm } from "@/components/dashboard/campaign-form";

export default async function OwnerNewCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireBusinessAccess(id);

  const business = await getBusinessByIdForOwner(id);
  if (!business) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href={`/dashboard/restaurants/${business.id}`}
          className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          ← Back to {business.name}
        </Link>
      </div>
      <CampaignForm businessId={business.id} scope="owner" />
    </div>
  );
}
