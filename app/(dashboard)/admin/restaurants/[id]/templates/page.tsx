import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/dal";
import { getBusinessByIdForOwner } from "@/lib/queries/businesses";
import { listResponseTemplatesForBusiness } from "@/lib/queries/response-templates";
import { TemplateManager } from "@/components/dashboard/template-manager";

export const dynamic = "force-dynamic";

// Admin-side reply templates. Shares the TemplateManager + server actions
// with the owner page; the actions use requireBusinessAccess which
// short-circuits true for super-admins via has_business_access, so the
// same writes pass RLS without any extra plumbing.
export default async function AdminResponseTemplatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;

  const business = await getBusinessByIdForOwner(id);
  if (!business) notFound();

  const templates = await listResponseTemplatesForBusiness(id);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/admin/restaurants/${business.id}/feedback`}
          className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          ← Back to feedback
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Reply templates</h1>
        <p className="text-sm text-muted-foreground">
          Canned replies for <span className="font-medium text-foreground">{business.name}</span>.
          Changes apply to the owner&apos;s feedback inbox as well.
        </p>
      </header>

      <TemplateManager businessId={business.id} templates={templates} />
    </div>
  );
}
