import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessAccess } from "@/lib/dal";
import { getBusinessByIdForOwner } from "@/lib/queries/businesses";
import { RestaurantEditOwnerForm } from "@/components/dashboard/restaurant-edit-owner-form";
import { RestaurantLogoUploader } from "@/components/dashboard/restaurant-logo-uploader";

export default async function OwnerRestaurantEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireBusinessAccess(id);

  const business = await getBusinessByIdForOwner(id);
  if (!business) notFound();

  return (
    <div className="space-y-10">
      <div>
        <Link
          href={`/dashboard/restaurants/${business.id}`}
          className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          ← Back to {business.name}
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Edit details</h1>
        <p className="text-sm text-muted-foreground">
          Update name and operational details for this business.
        </p>
      </header>

      <RestaurantLogoUploader
        businessId={business.id}
        currentLogoUrl={business.logo_url}
      />

      <RestaurantEditOwnerForm
        defaults={{
          id: business.id,
          name: business.name,
          slug: business.slug,
          google_review_url: business.google_review_url,
          google_place_id: business.google_place_id,
          phone: business.phone,
          address: business.address,
          hours: business.hours,
        }}
      />
    </div>
  );
}
