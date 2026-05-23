"use client";

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
        <GoogleReviewPanel
          rating={rating}
          googleReviewUrl={googleReviewUrl}
          onFirstInteraction={onPublicSelected}
          onChipClicked={onChipClicked}
          onCopyClicked={onCopyClicked}
          onRedirectClicked={onRedirectClicked}
        />
        <PrivateFeedbackPanel
          businessId={businessId}
          campaignId={campaignId}
          sessionId={sessionId}
          rating={rating}
          onFirstInteraction={onPrivateSelected}
          onSubmitted={onFeedbackSubmitted}
        />
      </div>
    </section>
  );
}
