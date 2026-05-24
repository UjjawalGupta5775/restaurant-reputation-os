// Billing state machine — pure functions, no I/O.
//
// This is the canonical place to answer "is this business operational?"
// and "what banner should we show?" The application code never reads
// the raw `status` column directly to make access decisions — it always
// goes through hasOperationalAccess() so the override + grace + trial
// rules stay in one place.
//
// Internal statuses are deliberately a smaller set than what the
// provider emits. The LS adapter maps its 7 statuses down to these 4
// (see lib/billing/lemonsqueezy.ts#mapLemonStatus).
//
// Three orthogonal access dimensions, evaluated in order:
//
//   1. admin_override_until > now()  → always operational. Covers
//      grandfathered tenants, comped accounts, support recovery, etc.
//
//   2. trial_ends_at > now()         → operational if status == trialing.
//      A trial is always full access.
//
//   3. status + grace_until + current_period_ends_at decide the rest:
//        - active                  → operational
//        - past_due, grace_until in future  → operational (recovery window)
//        - canceled, grace_until in future  → operational (cancel-at-period-end)
//        - past_due, no grace      → NOT operational (banner-only in V1)
//        - canceled, grace expired → NOT operational (banner-only in V1)
//
// V1 enforcement is banner-only: hasOperationalAccess can return false
// but routes/server actions stay open until BILLING_ENFORCEMENT_ENABLED
// flips. That env flag lives in lib/billing/trial.ts and is read by
// route guards, NOT by hasOperationalAccess itself. Keeping enforcement
// out of this file means tests can verify state independently.

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export type SubscriptionRecord = {
  id: string;
  businessId: string;
  provider: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  graceUntil: string | null;
  adminOverrideUntil: string | null;
  cancelAt: string | null;
  canceledAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AccessReason =
  | "admin_override"
  | "trial"
  | "active"
  | "past_due_grace"
  | "cancel_grace"
  | "expired"
  | "no_subscription";

export type AccessVerdict = {
  ok: boolean;
  reason: AccessReason;
  // For banner copy. ISO string of the most relevant boundary —
  // trial end, grace end, or override end.
  until: string | null;
};

const future = (iso: string | null, now: Date): boolean => {
  if (!iso) return false;
  return new Date(iso).getTime() > now.getTime();
};

// Computes whether a business has operational access. Pass `now` for
// testability — defaults to the actual current time.
//
// Returns a verdict (not just a bool) so callers can render banners
// without re-deriving "why".
export function evaluateAccess(
  sub: SubscriptionRecord | null,
  now: Date = new Date(),
): AccessVerdict {
  if (!sub) {
    return { ok: false, reason: "no_subscription", until: null };
  }

  if (future(sub.adminOverrideUntil, now)) {
    return { ok: true, reason: "admin_override", until: sub.adminOverrideUntil };
  }

  if (sub.status === "trialing" && future(sub.trialEndsAt, now)) {
    return { ok: true, reason: "trial", until: sub.trialEndsAt };
  }

  if (sub.status === "active") {
    return { ok: true, reason: "active", until: sub.currentPeriodEndsAt };
  }

  if (sub.status === "past_due" && future(sub.graceUntil, now)) {
    return { ok: true, reason: "past_due_grace", until: sub.graceUntil };
  }

  if (sub.status === "canceled" && future(sub.graceUntil, now)) {
    return { ok: true, reason: "cancel_grace", until: sub.graceUntil };
  }

  return { ok: false, reason: "expired", until: null };
}

// Convenience for callers that only need the boolean.
export function hasOperationalAccess(
  sub: SubscriptionRecord | null,
  now: Date = new Date(),
): boolean {
  return evaluateAccess(sub, now).ok;
}

export type BannerTone = "info" | "warn" | "critical";

export type BillingBanner = {
  tone: BannerTone;
  // Short status line: "Trial ends in 3 days", "Payment failed", etc.
  headline: string;
  // Longer hint with the resolution path. Optional.
  body?: string;
  // What the CTA button should do — purely advisory, the UI decides.
  cta?: "manage_billing" | "update_payment" | "start_checkout";
  // ISO timestamp the banner is anchored on (trial end, grace end).
  until: string | null;
};

// Returns a banner descriptor for the current sub state, or null when
// no banner should show. UI components render the message; this layer
// decides whether one is warranted and at what tone.
//
// Banner thresholds:
//   - trialing, > 7 days left      → no banner
//   - trialing, ≤ 7 days left      → info
//   - trialing, ≤ 1 day left       → warn
//   - trial expired (no sub)       → critical
//   - past_due in grace            → warn
//   - past_due grace expired       → critical
//   - canceled in grace            → warn ("ends on X")
//   - canceled grace expired       → critical
//   - admin_override               → no banner (we don't surface internal overrides to owners)
//   - active                       → no banner
export function deriveBanner(
  sub: SubscriptionRecord | null,
  now: Date = new Date(),
): BillingBanner | null {
  const verdict = evaluateAccess(sub, now);

  if (verdict.reason === "admin_override") return null;
  if (verdict.reason === "active") return null;

  if (verdict.reason === "no_subscription") {
    return {
      tone: "critical",
      headline: "No active subscription",
      body: "Start a subscription to keep using the dashboard.",
      cta: "start_checkout",
      until: null,
    };
  }

  if (verdict.reason === "trial") {
    // Once the owner has a provider-side subscription their card is on
    // file; the LS trial converts automatically when it ends. Surfacing
    // "Subscribe now" in this state is noise — payment failures will
    // come through the past_due branch instead.
    if (sub?.providerSubscriptionId) return null;

    const trialEnd = sub?.trialEndsAt ? new Date(sub.trialEndsAt) : null;
    const daysLeft = trialEnd
      ? Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : null;

    if (daysLeft == null || daysLeft > 7) return null;

    if (daysLeft <= 1) {
      return {
        tone: "warn",
        headline: "Trial ends in less than a day",
        body: "Add a payment method to keep your dashboard active.",
        cta: "start_checkout",
        until: sub!.trialEndsAt,
      };
    }
    return {
      tone: "info",
      headline: `Trial ends in ${daysLeft} days`,
      body: "Add a payment method whenever you're ready.",
      cta: "start_checkout",
      until: sub!.trialEndsAt,
    };
  }

  if (verdict.reason === "past_due_grace") {
    return {
      tone: "warn",
      headline: "Payment failed — please update your card",
      body: "We'll keep trying. Update your payment method to avoid interruption.",
      cta: "update_payment",
      until: sub!.graceUntil,
    };
  }

  if (verdict.reason === "cancel_grace") {
    return {
      tone: "warn",
      headline: "Subscription ends soon",
      body: "Your subscription will end on the scheduled date. Resume to keep going.",
      cta: "manage_billing",
      until: sub!.graceUntil,
    };
  }

  // expired
  if (sub?.status === "past_due") {
    return {
      tone: "critical",
      headline: "Subscription past due",
      body: "Update your payment method to restore your dashboard.",
      cta: "update_payment",
      until: null,
    };
  }

  // canceled / expired hard
  return {
    tone: "critical",
    headline: "Subscription ended",
    body: "Restart your subscription to keep using the dashboard.",
    cta: "start_checkout",
    until: null,
  };
}
