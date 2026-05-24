// Required funnel events for the customer flow. The 9 names below match
// PROJECT_CONTEXT.md § "Required Event Names" verbatim — dashboard
// queries (lib/queries/analytics.ts) reference them by exact string.
//
// funnel_paused_view is an observability-only event added for the V1
// subscription-pause surface: it fires when /r/[slug] renders the
// "reviews paused" notice instead of the funnel. Lets us measure how
// many customers hit the wall during a billing lapse without polluting
// the existing dashboard KPIs (which filter on the 9 funnel-stage names).
export const FUNNEL_EVENTS = [
  "scan_opened",
  "stars_selected",
  "public_review_selected",
  "private_feedback_selected",
  "prompt_chip_clicked",
  "copy_clicked",
  "google_redirect_clicked",
  "feedback_submitted",
  "thank_you_viewed",
  "funnel_paused_view",
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];
