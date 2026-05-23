import QRCode from "qrcode";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/qr/[campaignId]">,
) {
  const { campaignId } = await ctx.params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("campaigns")
    .select("slug, business:businesses(slug)")
    .eq("id", campaignId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return new Response("Not found", { status: 404 });
  }

  const businessField = (data as unknown as {
    business: { slug: string } | { slug: string }[] | null;
  }).business;
  const business = Array.isArray(businessField)
    ? businessField[0]
    : businessField;
  if (!business) {
    return new Response("Not found", { status: 404 });
  }

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const target = `${proto}://${host}/r/${business.slug}?c=${data.slug as string}`;

  const format = request.nextUrl.searchParams.get("format") === "svg" ? "svg" : "png";
  const wantDownload = request.nextUrl.searchParams.get("download") === "1";

  if (format === "svg") {
    // Vector output for owners who want to print at any size without
    // pixelation (table tents, posters, window decals). qrcode's string
    // SVG renderer doesn't accept `width` directly — emit a clean square
    // SVG and let downstream tools scale it.
    const svg = await QRCode.toString(target, { type: "svg", margin: 2 });
    const responseHeaders: Record<string, string> = {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    };
    if (wantDownload) {
      responseHeaders["Content-Disposition"] =
        `attachment; filename="qr-${campaignId}.svg"`;
    }
    return new Response(svg, { headers: responseHeaders });
  }

  const png = await QRCode.toBuffer(target, { width: 1024, margin: 2 });

  const responseHeaders: Record<string, string> = {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  if (wantDownload) {
    responseHeaders["Content-Disposition"] =
      `attachment; filename="qr-${campaignId}.png"`;
  }

  return new Response(new Uint8Array(png), { headers: responseHeaders });
}
