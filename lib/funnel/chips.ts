// Rating-neutral, factual observations. Do not add coercive prompts like
// "Tell them how amazing it was!" — that would violate the hard product rule
// against incentivizing only positive reviews (PROJECT_CONTEXT.md).
export const REVIEW_CHIPS = [
  "Friendly staff",
  "Quick service",
  "Food was hot",
  "Loved the ambiance",
  "Easy ordering",
  "Good portion size",
  "Clean space",
  "Would visit again",
] as const;

export type ReviewChip = (typeof REVIEW_CHIPS)[number];
