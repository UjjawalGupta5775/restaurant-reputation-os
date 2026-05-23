"use client";

import { Button } from "@/components/ui/button";

export function QRDownload({
  campaignId,
  publicUrl,
}: {
  campaignId: string;
  publicUrl: string;
}) {
  const qrUrl = `/api/qr/${campaignId}`;
  const downloadPng = `${qrUrl}?download=1`;
  const downloadSvg = `${qrUrl}?format=svg&download=1`;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4 w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrUrl}
          alt="QR code"
          width={256}
          height={256}
          className="block size-64"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <a href={downloadPng} download>
          <Button type="button">Download PNG</Button>
        </a>
        <a href={downloadSvg} download>
          <Button type="button" variant="outline">
            Download SVG
          </Button>
        </a>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(publicUrl);
          }}
        >
          Copy public link
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        SVG is vector — scale it to any size for table tents, posters, or
        window decals without pixelation.
      </p>
      <p className="text-sm text-muted-foreground break-all">{publicUrl}</p>
    </div>
  );
}
