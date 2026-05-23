import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessAccess } from "@/lib/dal";
import { getBusinessByIdForOwner } from "@/lib/queries/businesses";
import { listResponseTemplatesForBusiness } from "@/lib/queries/response-templates";
import { TemplateManager } from "@/components/dashboard/template-manager";

export const dynamic = "force-dynamic";

export default async function ResponseTemplatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireBusinessAccess(id);

  const business = await getBusinessByIdForOwner(id);
  if (!business) notFound();

  const templates = await listResponseTemplatesForBusiness(id);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/dashboard/restaurants/${business.id}/feedback`}
          className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          ← Back to feedback
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Reply templates</h1>
        <p className="text-sm text-muted-foreground">
          Canned replies for {business.name}. Surface in the feedback inbox
          so you can copy a personalised reply into WhatsApp, SMS, or email
          in two taps.
        </p>
      </header>

      <TemplateManager businessId={business.id} templates={templates} />
    </div>
  );
}
