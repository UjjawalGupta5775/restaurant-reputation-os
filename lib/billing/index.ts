// Default billing provider factory.
//
// One line is the entire provider selection. Swap this when adding a
// new adapter — every other file in the codebase only depends on
// BillingProvider, never on a concrete implementation.

import { lemonSqueezyProvider } from "@/lib/billing/lemonsqueezy";
import type { BillingProvider } from "@/lib/billing/provider";

export function getBillingProvider(): BillingProvider {
  return lemonSqueezyProvider;
}

// Re-exports for ergonomics — callers can `import { ... } from "@/lib/billing"`.
export type {
  BillingProvider,
  BillingEvent,
  BillingEventKind,
  CreateCheckoutInput,
  CreateCheckoutResult,
  GetPortalInput,
  GetPortalResult,
} from "@/lib/billing/provider";

export {
  hasOperationalAccess,
  evaluateAccess,
  deriveBanner,
} from "@/lib/billing/state";

export type {
  SubscriptionStatus,
  SubscriptionRecord,
  AccessReason,
  AccessVerdict,
  BillingBanner,
} from "@/lib/billing/state";

export {
  trialDays,
  pastDueGraceDays,
  cancelGraceDays,
  enforcementEnabled,
  newTrialEndsAt,
  newPastDueGraceUntil,
  newCancelGraceUntil,
} from "@/lib/billing/trial";
