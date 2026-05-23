"use client";

import { useActionState, useRef, useState } from "react";
import {
  updateBusinessLogo,
  clearBusinessLogo,
  type LogoFormState,
} from "@/lib/actions/businesses";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  businessId: string;
  currentLogoUrl: string | null;
};

// Owner logo uploader. Two server actions back this — upload and clear — so
// the UI splits into two forms sharing the same business id. Local preview
// (object URL) keeps things responsive before the upload round-trips.
export function RestaurantLogoUploader({ businessId, currentLogoUrl }: Props) {
  const [uploadState, uploadAction, uploading] = useActionState<
    LogoFormState,
    FormData
  >(updateBusinessLogo, undefined);
  const [clearState, clearAction, clearing] = useActionState<
    LogoFormState,
    FormData
  >(clearBusinessLogo, undefined);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayUrl = previewUrl ?? currentLogoUrl;
  const error = uploadState?.error ?? clearState?.error;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Logo</CardTitle>
        <CardDescription>
          Shown to customers on the public review page and to you on your
          dashboard. PNG, JPEG, or WebP, up to 2 MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/20">
            {displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayUrl}
                alt="Current logo"
                className="size-full object-cover"
              />
            ) : (
              <span className="text-xs text-muted-foreground">No logo</span>
            )}
          </div>
          <div className="flex-1 text-sm text-muted-foreground">
            {currentLogoUrl
              ? "Upload a new file below to replace, or remove the current logo."
              : "Upload a square image for best results."}
          </div>
        </div>

        <form action={uploadAction} className="space-y-3">
          <input type="hidden" name="id" value={businessId} />
          <input
            ref={fileInputRef}
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp"
            required
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (previewUrl) URL.revokeObjectURL(previewUrl);
              setPreviewUrl(file ? URL.createObjectURL(file) : null);
            }}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={uploading} size="sm">
              {uploading ? "Uploading…" : "Upload logo"}
            </Button>
            {currentLogoUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={clearing}
                onClick={() => {
                  if (previewUrl) {
                    URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                  }
                  if (fileInputRef.current) fileInputRef.current.value = "";
                  const fd = new FormData();
                  fd.set("id", businessId);
                  clearAction(fd);
                }}
              >
                {clearing ? "Removing…" : "Remove logo"}
              </Button>
            )}
          </div>
        </form>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {uploadState?.ok && !error && (
          <p role="status" className="text-sm text-muted-foreground">
            Logo updated.
          </p>
        )}
        {clearState?.ok && !error && (
          <p role="status" className="text-sm text-muted-foreground">
            Logo removed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
