import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusinessByIdForOwner } from "@/lib/queries/businesses";
import { RestaurantEditForm } from "@/components/dashboard/restaurant-edit-form";

export default async function AdminEditRestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const business = await getBusinessByIdForOwner(id);
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
      <RestaurantEditForm
        scope="admin"
        defaults={{
          id: business.id,
          name: business.name,
          slug: business.slug,
          google_review_url: business.google_review_url,
          google_place_id: business.google_place_id,
        }}
      />
    </div>
  );
}
