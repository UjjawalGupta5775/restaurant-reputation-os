// Platform-default chip vocabulary used as the seed list for every new
// business (see migration 0015) and as the fallback when a business
// somehow has zero rows. Rating-neutral factual observations only —
// never coercive prompts like "Tell them how amazing it was!" — to
// comply with PROJECT_CONTEXT.md's no-sentiment-incentive rule.
export const DEFAULT_REVIEW_CHIPS = [
  "Friendly staff",
  "Quick service",
  "Food was hot",
  "Loved the ambiance",
  "Easy ordering",
  "Good portion size",
  "Clean space",
  "Would visit again",
] as const;

export type DefaultReviewChip = (typeof DEFAULT_REVIEW_CHIPS)[number];
