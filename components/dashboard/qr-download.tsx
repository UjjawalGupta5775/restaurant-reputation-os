"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type CopyState = "idle" | "copied" | "failed";

// Some browsers (older Safari, non-HTTPS contexts) don't expose the async
// Clipboard API. Fall back to the legacy execCommand path so the button
// still works on the long tail of devices a business owner might have.
async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

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
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const handleCopy = async () => {
    const ok = await copyText(publicUrl);
    setCopyState(ok ? "copied" : "failed");
    window.setTimeout(() => setCopyState("idle"), 2000);
  };

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
          onClick={handleCopy}
          aria-live="polite"
        >
          {copyState === "copied" ? (
            <>
              <Check aria-hidden className="size-4" />
              Copied
            </>
          ) : copyState === "failed" ? (
            "Copy failed — select link below"
          ) : (
            <>
              <Copy aria-hidden className="size-4" />
              Copy public link
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        SVG is vector — scale it to any size for table tents, posters, or
        window decals without pixelation.
      </p>
      <p className="text-sm text-muted-foreground break-all select-all">
        {publicUrl}
      </p>
    </div>
  );
}
