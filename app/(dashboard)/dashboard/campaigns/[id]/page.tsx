import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireBusinessAccess } from "@/lib/dal";
import { getCampaignWithBusinessForOwner } from "@/lib/queries/campaigns";
import { QRDownload } from "@/components/dashboard/qr-download";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaignWithBusinessForOwner(id);
  if (!campaign) notFound();

  // Gate by membership in the owning business. RLS already filters the
  // query, but this provides a clear 403-style redirect for non-members.
  await requireBusinessAccess(campaign.business.id);

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const publicUrl = `${proto}://${host}/r/${campaign.business.slug}?c=${campaign.slug}`;

  return (
    <div className="space-y-10">
      <div>
        <Link
          href={`/dashboard/restaurants/${campaign.business.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to {campaign.business.name}
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-serif text-3xl tracking-tight">{campaign.name}</h1>
        <p className="text-sm text-muted-foreground">
          <span className="capitalize">{campaign.source_type}</span>
          {campaign.table_code && <> · table {campaign.table_code}</>}
          {campaign.staff_code && <> · staff {campaign.staff_code}</>}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Print this QR</CardTitle>
          <CardDescription>
            Scanning lands customers on the public rating page. Your admin
            manages new campaigns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QRDownload campaignId={campaign.id} publicUrl={publicUrl} />
        </CardContent>
      </Card>
    </div>
  );
}
