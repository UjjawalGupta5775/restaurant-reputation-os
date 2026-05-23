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
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];
