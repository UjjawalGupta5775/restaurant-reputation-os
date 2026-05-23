"use client";

import { ChevronDown } from "lucide-react";
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
// (private feedback) panel is additionally wrapped in a native <details>
// accordion on mobile; a globals.css rule swaps the <details> to
// `display: contents` at md+, keeping the desktop two-column layout intact.
//
// This is intentionally NOT review gating: both paths render in the DOM at
// every rating, neither is removed or hidden by JS, and the Google review
// panel is never collapsed behind an accordion at any rating.
const QUIET_CARD = "bg-muted/30 ring-foreground/5";

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

  // At 4-5★, wrap the private panel in a <details> so mobile users see a
  // single-line tile they can tap to expand. On desktop (md+) globals.css
  // sets the <details> to display:contents and hides the summary, so the
  // card sits directly in the grid cell — same as today.
  const privateSlot = !privateFirst ? (
    <details
      data-funnel-accordion=""
      className="group/funnel-details rounded-xl"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl bg-muted/30 px-4 py-4 text-sm font-medium ring-1 ring-foreground/10 select-none">
        <span>Prefer to tell the owner privately?</span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/funnel-details:rotate-180"
        />
      </summary>
      <div className="pt-2">{privatePanel}</div>
    </details>
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
