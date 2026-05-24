// Trial + grace window configuration. Centralizes the env reads so the
// rest of the billing layer doesn't sprinkle process.env across files.
//
// Defaults match the operational philosophy in billing-lemonsqueezy.md:
//   - 14-day trial (matches the LS product config)
//   - 7-day past-due grace (payment retry window)
//   - 3-day cancel grace (cancel-at-period-end fallback if ends_at not set)
//
// The single source of truth for the actual trial length is the LS
// variant — when the variant fires subscription_created with
// trial_ends_at, we store that timestamp verbatim. BILLING_TRIAL_DAYS
// is only used for businesses created BEFORE any LS subscription
// exists (the owner-self-serve signup path will use it to set a local
// trial_ends_at before the first checkout completes).

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw == null) return fallback;
  return raw === "true" || raw === "1";
}

export function trialDays(): number {
  return envInt("BILLING_TRIAL_DAYS", 14);
}

export function pastDueGraceDays(): number {
  return envInt("BILLING_PAST_DUE_GRACE_DAYS", 7);
}

export function cancelGraceDays(): number {
  return envInt("BILLING_CANCEL_GRACE_DAYS", 3);
}

// When true, route guards and server actions hard-lock owner surfaces
// for businesses without operational access. V1 default is false —
// banners only, no hard-lock — per the operational-calmness philosophy.
//
// Flipping this to true is the deliberate "enforcement on" moment that
// happens AFTER webhook reliability is proven over weeks of test mode.
export function enforcementEnabled(): boolean {
  return envBool("BILLING_ENFORCEMENT_ENABLED", false);
}

function isoOffset(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function newTrialEndsAt(): string {
  return isoOffset(trialDays());
}

export function newPastDueGraceUntil(): string {
  return isoOffset(pastDueGraceDays());
}

export function newCancelGraceUntil(): string {
  return isoOffset(cancelGraceDays());
}
