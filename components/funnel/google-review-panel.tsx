"use client";

import { useRef, useState } from "react";
import { REVIEW_CHIPS } from "@/lib/funnel/chips";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  rating: number;
  googleReviewUrl: string | null;
  onFirstInteraction: () => void;
  onChipClicked: (chip: string) => void;
  onCopyClicked: (chars: number) => void;
  onRedirectClicked: () => void;
};

export function GoogleReviewPanel({
  rating,
  googleReviewUrl,
  onFirstInteraction,
  onChipClicked,
  onCopyClicked,
  onRedirectClicked,
}: Props) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [openedReminder, setOpenedReminder] = useState(false);
  const interacted = useRef(false);
  const STARS = [1, 2, 3, 4, 5];

  const flagInteraction = () => {
    if (!interacted.current) {
      interacted.current = true;
      onFirstInteraction();
    }
  };

  const appendChip = (chip: string) => {
    flagInteraction();
    onChipClicked(chip);
    setText((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return `${chip}.`;
      if (trimmed.endsWith(".")) return `${trimmed} ${chip}.`;
      return `${trimmed}. ${chip}.`;
    });
  };

  const copyToClipboard = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback: select content so user can copy manually.
      const sel = window.getSelection();
      const node = document.getElementById("google-review-text");
      if (sel && node) {
        sel.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(node);
        sel.addRange(range);
      }
      return false;
    }
  };

  const handleCopy = async () => {
    flagInteraction();
    onCopyClicked(text.length);
    await copyToClipboard();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOpen = async () => {
    flagInteraction();
    if (text.length > 0) {
      const ok = await copyToClipboard();
      if (ok) {
        onCopyClicked(text.length);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    }
    onRedirectClicked();
    setOpenedReminder(true);
    setTimeout(() => setOpenedReminder(false), 8000);
    if (googleReviewUrl) {
      window.open(googleReviewUrl, "_blank", "noopener,noreferrer");
    }
  };

  const noUrl = !googleReviewUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">
          Leave a Google review
        </CardTitle>
        <CardDescription>
          Pick chips or write a draft, then tap below — we&apos;ll copy your
          text to your clipboard and open Google so you can paste and post.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!noUrl && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-sm">
            <span
              role="img"
              aria-label={`${rating} of 5 stars`}
              className="inline-flex items-center gap-0.5 text-base"
            >
              {STARS.map((n) => (
                <span
                  key={n}
                  aria-hidden="true"
                  className={
                    rating >= n
                      ? "text-amber-500"
                      : "text-muted-foreground/30"
                  }
                >
                  {rating >= n ? "★" : "☆"}
                </span>
              ))}
            </span>
            <span className="text-muted-foreground">
              Tap the same {rating} {rating === 1 ? "star" : "stars"} on
              Google&apos;s page — it has its own picker.
            </span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {REVIEW_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => appendChip(chip)}
              className="rounded-full border border-input bg-background px-3 py-1.5 text-sm transition-colors hover:bg-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
            >
              {chip}
            </button>
          ))}
        </div>
        <Textarea
          id="google-review-text"
          value={text}
          onChange={(e) => {
            flagInteraction();
            setText(e.target.value);
          }}
          onFocus={flagInteraction}
          placeholder="Your review draft will appear here. Edit it before posting."
          rows={4}
          className="min-h-24"
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={handleCopy}
            disabled={text.length === 0}
            className="flex-1"
          >
            {copied ? "Copied!" : "Copy text"}
          </Button>
          <Button
            type="button"
            onClick={handleOpen}
            disabled={noUrl}
            className="flex-1"
          >
            Copy &amp; open Google
          </Button>
        </div>
        {openedReminder && !noUrl && (
          <div
            role="status"
            className="rounded-md border border-emerald-500/30 bg-emerald-500/8 px-3 py-2 text-sm"
          >
            <p className="font-medium">Opening Google in a new tab.</p>
            <p className="mt-1 text-muted-foreground">
              On Google&apos;s page: tap <span className="font-medium text-foreground">{rating} {rating === 1 ? "star" : "stars"}</span>, paste your text, then post.
            </p>
          </div>
        )}
        {noUrl && (
          <p className="text-xs text-muted-foreground">
            This restaurant hasn&apos;t set up a Google review link yet — you
            can still send private feedback below.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
