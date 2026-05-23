import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getCampaignWithBusinessForOwner } from "@/lib/queries/campaigns";
import { QRDownload } from "@/components/dashboard/qr-download";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AdminCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaignWithBusinessForOwner(id);
  if (!campaign) notFound();

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const publicUrl = `${proto}://${host}/r/${campaign.business.slug}?c=${campaign.slug}`;

  return (
    <div className="space-y-10">
      <div>
        <Link
          href={`/admin/restaurants/${campaign.business.id}`}
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
            Scanning lands customers on the public rating page. The PNG is
            high-resolution (1024px) and safe to print at any size.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QRDownload campaignId={campaign.id} publicUrl={publicUrl} />
        </CardContent>
      </Card>
    </div>
  );
}
