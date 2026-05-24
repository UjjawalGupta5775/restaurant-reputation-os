import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/dal";
import { getBusinessByIdForOwner } from "@/lib/queries/businesses";
import {
  getChipSettings,
  listChipsForOwner,
} from "@/lib/queries/review-chips";
import { ReviewChipManager } from "@/components/dashboard/review-chip-manager";

export const dynamic = "force-dynamic";

// Mirror of the owner-side review-prompts page, gated by requireSuperAdmin
// instead of requireBusinessAccess. Reuses the same manager + actions —
// RLS already grants super-admins write access on review_chips via the
// has_business_access helper (see migration 0010 comment).
export default async function AdminReviewPromptsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;

  const business = await getBusinessByIdForOwner(id);
  if (!business) notFound();

  const [chips, settings] = await Promise.all([
    listChipsForOwner(id),
    getChipSettings(id),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/admin/restaurants/${business.id}`}
          className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          ← Back to business
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Review prompts</h1>
        <p className="text-sm text-muted-foreground">
          Managing prompts for <span className="font-medium text-foreground">{business.name}</span>{" "}
          (/r/{business.slug}). Changes go live to customers immediately.
        </p>
      </header>

      <ReviewChipManager
        businessId={business.id}
        chips={chips}
        settings={settings}
      />
    </div>
  );
}
