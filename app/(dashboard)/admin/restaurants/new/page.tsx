import Link from "next/link";
import { RestaurantForm } from "@/components/dashboard/restaurant-form";

export default function NewRestaurantPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href="/admin"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to admin
        </Link>
      </div>
      <RestaurantForm scope="admin" />
    </div>
  );
}
