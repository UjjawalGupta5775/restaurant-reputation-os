"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/actions/events";
import type { FunnelEvent } from "@/lib/funnel/events";
import { getSessionId } from "@/lib/funnel/session";
import { RatingScreen } from "./rating-screen";
import { DualPathScreen } from "./dual-path-screen";
import { ThanksScreen } from "./thanks-screen";

type Business = {
  id: string;
  name: string;
  google_review_url: string | null;
};

type Campaign = {
  id: string;
  slug: string;
} | null;

type Props = {
  business: Business;
  campaign: Campaign;
};

type Screen = "rating" | "dual" | "thanks";

export function CustomerFunnel({ business, campaign }: Props) {
  const [screen, setScreen] = useState<Screen>("rating");
  const [rating, setRating] = useState(0);
  const [thanksPath, setThanksPath] = useState<"google" | "private">(
    "private",
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scanFired = useRef(false);

  // sessionStorage isn't available during SSR; initialize on mount. The
  // cascading-render lint is intentional here — we need the post-hydration
  // render to pick up the client-only value, and trying to read it during
  // useState's initializer breaks SSR.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessionId(getSessionId());
  }, []);

  const emit = useCallback(
    (event: FunnelEvent, metadata?: Record<string, unknown>) => {
      if (!sessionId) return;
      void trackEvent({
        businessId: business.id,
        campaignId: campaign?.id ?? null,
        sessionId,
        event,
        metadata,
      });
    },
    [business.id, campaign?.id, sessionId],
  );

  useEffect(() => {
    if (!sessionId || scanFired.current) return;
    scanFired.current = true;
    emit("scan_opened", { campaignSlug: campaign?.slug ?? null });
  }, [sessionId, emit, campaign?.slug]);

  const handleRate = (n: number) => {
    setRating(n);
    emit("stars_selected", { rating: n });
    setScreen("dual");
  };

  if (screen === "thanks") {
    return (
      <ThanksScreen
        path={thanksPath}
        onViewed={(path) => emit("thank_you_viewed", { path })}
      />
    );
  }

  if (screen === "dual") {
    return (
      <DualPathScreen
        businessId={business.id}
        campaignId={campaign?.id ?? null}
        sessionId={sessionId ?? ""}
        rating={rating}
        googleReviewUrl={business.google_review_url}
        onPublicSelected={() => emit("public_review_selected")}
        onPrivateSelected={() => emit("private_feedback_selected")}
        onChipClicked={(chip) => emit("prompt_chip_clicked", { chip })}
        onCopyClicked={(chars) => emit("copy_clicked", { chars })}
        onRedirectClicked={() => emit("google_redirect_clicked")}
        onFeedbackSubmitted={() => {
          setThanksPath("private");
          setScreen("thanks");
        }}
      />
    );
  }

  return <RatingScreen businessName={business.name} onRate={handleRate} />;
}
