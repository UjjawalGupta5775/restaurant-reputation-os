import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusinessByIdForOwner } from "@/lib/queries/businesses";
import { listOwnersForBusiness } from "@/lib/actions/owners";
import { OwnerInviteForm } from "@/components/admin/owner-invite-form";
import { OwnerRemoveButton } from "@/components/admin/owner-remove-button";
import { Card, CardContent } from "@/components/ui/card";
import { absoluteTime } from "@/lib/format";

export default async function AdminRestaurantOwnersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const business = await getBusinessByIdForOwner(id);
  if (!business) notFound();

  const owners = await listOwnersForBusiness(business.id);

  return (
    <div className="space-y-10">
      <div>
        <Link
          href={`/admin/restaurants/${business.id}`}
          className="rounded-sm text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
        >
          ← Back to {business.name}
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">Owners</h1>
        <p className="tabular-nums text-sm text-muted-foreground">
          {owners.length} {owners.length === 1 ? "owner has" : "owners have"}{" "}
          access to {business.name}.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Current access
        </h2>
        {owners.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="font-serif italic text-base text-muted-foreground max-w-md mx-auto">
                Nobody has access yet. Invite the first owner below.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Added</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {owners.map((o) => (
                  <tr key={o.userId} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      {o.email ?? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {o.userId}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {absoluteTime(o.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex justify-end">
                        <OwnerRemoveButton
                          businessId={business.id}
                          userId={o.userId}
                          email={o.email}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="max-w-xl space-y-4">
        <OwnerInviteForm businessId={business.id} />
      </section>
    </div>
  );
}
