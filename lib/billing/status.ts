// Subscription page descriptor — what the persistent /billing surface
// shows. Distinct from deriveBanner(): the banner only fires when
// there's an OPERATIONAL signal (payment failed, cancel in grace,
// expired). The billing page always renders, even when everything is
// fine, so it needs a complete state→copy mapping.
//
// Pure function, no I/O. Centralizing the copy here keeps the page
// component thin and makes the mapping testable.

import type { SubscriptionRecord } from "@/lib/billing/state";

export type StatusTone = "neutral" | "info" | "warn" | "critical";

export type StatusBadge = {
  label: string;
  tone: StatusTone;
};

export type StatusCta = {
  label: string;
  // 'portal'   → call openCustomerPortal (existing provider sub)
  // 'checkout' → call startCheckout      (no provider sub yet, or restart)
  kind: "portal" | "checkout";
};

export type SubscriptionSummary = {
  badge: StatusBadge;
  // One-line context under the badge ("Renews on Jun 23, 2026" etc).
  dateLine: string | null;
  // The primary action available on the billing page. Always present —
  // even canceled subs offer a "Restart subscription" CTA.
  primaryCta: StatusCta;
  // Payment method snapshot from the most recent webhook, when LS gave
  // us one. Owners see "Visa ending in 4242" rather than raw JSON.
  paymentMethodLine: string | null;
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function paymentMethod(sub: SubscriptionRecord): string | null {
  const m = sub.metadata as Record<string, unknown>;
  const brand = m?.cardBrand;
  const last4 = m?.cardLastFour;
  if (typeof brand === "string" && typeof last4 === "string" && last4.length > 0) {
    const prettyBrand = brand.charAt(0).toUpperCase() + brand.slice(1);
    return `${prettyBrand} ending in ${last4}`;
  }
  return null;
}

export function describeSubscription(
  sub: SubscriptionRecord | null,
  now: Date = new Date(),
): SubscriptionSummary {
  if (!sub) {
    return {
      badge: { label: "No subscription", tone: "critical" },
      dateLine: null,
      primaryCta: { label: "Subscribe now", kind: "checkout" },
      paymentMethodLine: null,
    };
  }

  const pm = paymentMethod(sub);
  const adminOverride =
    sub.adminOverrideUntil && new Date(sub.adminOverrideUntil) > now;

  if (adminOverride) {
    return {
      badge: { label: "Access granted (admin)", tone: "info" },
      dateLine: `Override expires ${formatDate(sub.adminOverrideUntil)}`,
      primaryCta: {
        label: "Manage billing",
        kind: sub.providerSubscriptionId ? "portal" : "checkout",
      },
      paymentMethodLine: pm,
    };
  }

  if (sub.status === "trialing") {
    const trialEnd = formatDate(sub.trialEndsAt);
    if (sub.providerSubscriptionId) {
      // Card on file → LS will auto-convert. Owner manages from the
      // portal, not by re-running checkout.
      return {
        badge: { label: "Trial", tone: "info" },
        dateLine: trialEnd ? `Auto-converts on ${trialEnd}` : null,
        primaryCta: { label: "Manage billing", kind: "portal" },
        paymentMethodLine: pm,
      };
    }
    return {
      badge: { label: "Trial", tone: "info" },
      dateLine: trialEnd ? `Trial ends on ${trialEnd}` : null,
      primaryCta: { label: "Add payment method", kind: "checkout" },
      paymentMethodLine: pm,
    };
  }

  if (sub.status === "active") {
    const renews = formatDate(sub.currentPeriodEndsAt);
    return {
      badge: { label: "Active", tone: "info" },
      dateLine: renews ? `Renews on ${renews}` : null,
      primaryCta: { label: "Manage billing", kind: "portal" },
      paymentMethodLine: pm,
    };
  }

  if (sub.status === "past_due") {
    const inGrace = sub.graceUntil && new Date(sub.graceUntil) > now;
    return {
      badge: { label: "Payment failed", tone: "warn" },
      dateLine: inGrace
        ? `Update by ${formatDate(sub.graceUntil)} to avoid interruption`
        : "Update payment to restore access",
      primaryCta: { label: "Update payment", kind: "portal" },
      paymentMethodLine: pm,
    };
  }

  // status === 'canceled'
  const inCancelGrace = sub.graceUntil && new Date(sub.graceUntil) > now;
  if (inCancelGrace) {
    return {
      badge: { label: "Cancels at period end", tone: "warn" },
      dateLine: `Ends on ${formatDate(sub.graceUntil)}`,
      primaryCta: { label: "Resume subscription", kind: "portal" },
      paymentMethodLine: pm,
    };
  }
  const endedOn = formatDate(sub.canceledAt) ?? formatDate(sub.currentPeriodEndsAt);
  return {
    badge: { label: "Canceled", tone: "critical" },
    dateLine: endedOn ? `Ended ${endedOn}` : null,
    primaryCta: { label: "Restart subscription", kind: "checkout" },
    paymentMethodLine: pm,
  };
}
