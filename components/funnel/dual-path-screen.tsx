"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GoogleReviewPanel } from "./google-review-panel";
import { PrivateFeedbackPanel } from "./private-feedback-panel";

type Props = {
  businessId: string;
  campaignId: string | null;
  sessionId: string;
  rating: number;
  googleReviewUrl: string | null;
  onPublicSelected: () => void;
  onPrivateSelected: () => void;
  onChipClicked: (chip: string) => void;
  onCopyClicked: (chars: number) => void;
  onRedirectClicked: () => void;
  onFeedbackSubmitted: () => void;
};

// Rating-aware emphasis: the path that aligns with the customer's mood gets
// the default card surface and is rendered first. The other path stays fully
// visible and one-tap accessible — we only soften its surface (bg-muted/30,
// thinner ring) so the layout feels less crowded. At 4-5★ the secondary
// (private feedback) panel is additionally collapsed behind a tap-to-open
// trigger on mobile via <MobileCollapsible>; the trigger is hidden at md+
// (md:hidden) and the panel is always shown at md+ (md:block) so desktop
// keeps the two-column layout untouched.
//
// This is intentionally NOT review gating: both paths render in the DOM at
// every rating, neither is removed or hidden by JS, and the Google review
// panel is never collapsed at any rating.
const QUIET_CARD = "bg-muted/30 ring-foreground/5";

// Mobile-only collapsible. Trigger button is removed from layout at md+
// (md:hidden), and the panel is forced visible at md+ (md:block) regardless
// of the `open` state. Visibility is driven entirely by Tailwind's responsive
// variants, so there's no JS media query and no hydration flicker.
function MobileCollapsible({ children }: { children: ReactNode }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl bg-muted/30 px-4 py-4 text-sm font-medium ring-1 ring-foreground/10 select-none md:hidden"
      >
        <span>Prefer to tell the owner privately?</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <div id={panelId} className={open ? "block" : "hidden md:block"}>
        {children}
      </div>
    </>
  );
}

export function DualPathScreen({
  businessId,
  campaignId,
  sessionId,
  rating,
  googleReviewUrl,
  onPublicSelected,
  onPrivateSelected,
  onChipClicked,
  onCopyClicked,
  onRedirectClicked,
  onFeedbackSubmitted,
}: Props) {
  const privateFirst = rating > 0 && rating <= 3;

  const googlePanel = (
    <GoogleReviewPanel
      rating={rating}
      googleReviewUrl={googleReviewUrl}
      onFirstInteraction={onPublicSelected}
      onChipClicked={onChipClicked}
      onCopyClicked={onCopyClicked}
      onRedirectClicked={onRedirectClicked}
      className={privateFirst ? QUIET_CARD : undefined}
    />
  );

  const privatePanel = (
    <PrivateFeedbackPanel
      businessId={businessId}
      campaignId={campaignId}
      sessionId={sessionId}
      rating={rating}
      onFirstInteraction={onPrivateSelected}
      onSubmitted={onFeedbackSubmitted}
      className={privateFirst ? undefined : QUIET_CARD}
    />
  );

  const privateSlot = !privateFirst ? (
    <MobileCollapsible>{privatePanel}</MobileCollapsible>
  ) : (
    privatePanel
  );

  return (
    <section className="space-y-6">
      <header className="space-y-1 text-center">
        <p className="text-sm text-muted-foreground">
          You rated us{" "}
          <span className="font-serif tabular-nums text-base text-foreground">
            {rating}
          </span>
          <span className="font-serif text-base text-muted-foreground">
            {" / 5"}
          </span>
          . Both options below are open — pick whichever you like.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {privateFirst ? (
          <>
            {privatePanel}
            {googlePanel}
          </>
        ) : (
          <>
            {googlePanel}
            {privateSlot}
          </>
        )}
      </div>
    </section>
  );
}
