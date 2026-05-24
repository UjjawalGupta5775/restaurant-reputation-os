import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessAccess } from "@/lib/dal";
import { getBusinessByIdForOwner } from "@/lib/queries/businesses";
import {
  getChipSettings,
  listChipsForOwner,
} from "@/lib/queries/review-chips";
import { ReviewChipManager } from "@/components/dashboard/review-chip-manager";

export const dynamic = "force-dynamic";

export default async function ReviewPromptsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireBusinessAccess(id);

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
          href={`/dashboard/restaurants/${business.id}`}
          className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          ← Back to business
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">
          Review prompts
        </h1>
        <p className="text-sm text-muted-foreground">
          The tap-to-append phrases customers see after they pick a star
          rating on /r/{business.slug}. Editing these helps reviews
          mention what makes {business.name} different — instead of the
          same generic words every other business uses.
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
