"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type FunnelChip = { id: string; label: string };

type Props = {
  rating: number;
  googleReviewUrl: string | null;
  chips: FunnelChip[];
  displayMode: "manual" | "random";
  displayLimit: number;
  onFirstInteraction: () => void;
  onChipClicked: (chip: FunnelChip) => void;
  onCopyClicked: (chars: number) => void;
  onRedirectClicked: () => void;
  className?: string;
};

// Fisher-Yates — deterministic per call, no external lib. Mutates the copy
// we pass in so we never touch the prop array.
function shuffle<T>(items: T[]): T[] {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
  }
  return next;
}

export function GoogleReviewPanel({
  rating,
  googleReviewUrl,
  chips,
  displayMode,
  displayLimit,
  onFirstInteraction,
  onChipClicked,
  onCopyClicked,
  onRedirectClicked,
  className,
}: Props) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [openedReminder, setOpenedReminder] = useState(false);
  const interacted = useRef(false);
  const STARS = [1, 2, 3, 4, 5];

  // Compute the display set once per mount. 'manual' preserves owner
  // ordering; 'random' shuffles per page load so repeat visitors see
  // different prompts. Limit is applied after ordering so the count
  // matches what the owner configured. Memo is keyed on the inputs so
  // the seeded sequence is stable across re-renders within one screen.
  const visibleChips = useMemo(() => {
    const ordered =
      displayMode === "random" ? shuffle(chips) : chips;
    return ordered.slice(0, displayLimit);
  }, [chips, displayMode, displayLimit]);

  const flagInteraction = () => {
    if (!interacted.current) {
      interacted.current = true;
      onFirstInteraction();
    }
  };

  const appendChip = (chip: FunnelChip) => {
    flagInteraction();
    onChipClicked(chip);
    setText((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return `${chip.label}.`;
      if (trimmed.endsWith(".")) return `${trimmed} ${chip.label}.`;
      return `${trimmed}. ${chip.label}.`;
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
    <Card className={cn(className)}>
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
        {visibleChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {visibleChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => appendChip(chip)}
                className="rounded-full border border-input bg-background px-3 py-1.5 text-sm transition-colors hover:bg-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}
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
            This business hasn&apos;t set up a Google review link yet — you
            can still send private feedback below.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={handleCopy}
          disabled={text.length === 0}
          className="min-h-11 w-full flex-1 px-4 text-sm sm:w-auto"
        >
          {copied ? "Copied!" : "Copy draft"}
        </Button>
        <Button
          type="button"
          onClick={handleOpen}
          disabled={noUrl}
          className="min-h-11 w-full flex-1 px-4 text-sm sm:w-auto"
        >
          Post on Google
        </Button>
      </CardFooter>
    </Card>
  );
}
