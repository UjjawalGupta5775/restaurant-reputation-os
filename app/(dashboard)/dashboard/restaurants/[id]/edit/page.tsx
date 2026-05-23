import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessAccess } from "@/lib/dal";
import {
  getBusinessByIdForOwner,
  listBusinessesForOwner,
} from "@/lib/queries/businesses";
import { RestaurantEditOwnerForm } from "@/components/dashboard/restaurant-edit-owner-form";
import { RestaurantSwitcher } from "@/components/dashboard/restaurant-switcher";

export default async function OwnerRestaurantEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireBusinessAccess(id);

  const [business, restaurants] = await Promise.all([
    getBusinessByIdForOwner(id),
    listBusinessesForOwner(),
  ]);
  if (!business) notFound();

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/dashboard/restaurants/${business.id}`}
          className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          ← Back to {business.name}
        </Link>
        <RestaurantSwitcher
          restaurants={restaurants}
          currentBusinessId={business.id}
        />
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Edit details</h1>
        <p className="text-sm text-muted-foreground">
          Update name and operational details for this restaurant.
        </p>
      </header>

      <RestaurantEditOwnerForm
        defaults={{
          id: business.id,
          name: business.name,
          slug: business.slug,
          phone: business.phone,
          address: business.address,
          hours: business.hours,
        }}
      />
    </div>
  );
}
