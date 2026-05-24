#!/usr/bin/env node
// Pure unit checks for describeSubscription() — the persistent billing
// page's status mapping. No DB, no network.

import { describeSubscription } from "../lib/billing/status.ts";

let pass = true;
const log = (label, ok, info) => {
  pass = pass && ok;
  console.log(`  ${label.padEnd(64)} ${ok ? "ok" : "FAIL"} ${info ?? ""}`);
};

const NOW = new Date("2026-05-23T12:00:00Z");
const DAY = 24 * 3600 * 1000;

function sub(overrides) {
  return {
    id: "sub-1",
    businessId: "biz-1",
    provider: "lemonsqueezy",
    providerCustomerId: null,
    providerSubscriptionId: null,
    status: "trialing",
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    graceUntil: null,
    adminOverrideUntil: null,
    cancelAt: null,
    canceledAt: null,
    metadata: {},
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

console.log("describeSubscription smoke\n");

{
  const s = describeSubscription(null, NOW);
  log("null sub → No subscription / checkout", s.badge.label === "No subscription" && s.primaryCta.kind === "checkout");
}

{
  const s = describeSubscription(
    sub({ status: "trialing", trialEndsAt: new Date(NOW.getTime() + 4 * DAY).toISOString() }),
    NOW,
  );
  log("trial, no card → 'Add payment method' (checkout)", s.primaryCta.kind === "checkout" && s.primaryCta.label === "Add payment method");
  log("trial dateLine mentions trial end", s.dateLine?.includes("Trial ends on") ?? false, s.dateLine);
}

{
  const s = describeSubscription(
    sub({
      status: "trialing",
      providerSubscriptionId: "ls-99",
      trialEndsAt: new Date(NOW.getTime() + 4 * DAY).toISOString(),
    }),
    NOW,
  );
  log("trial WITH card → 'Manage billing' (portal)", s.primaryCta.kind === "portal");
  log("trial-with-card dateLine says auto-converts", s.dateLine?.includes("Auto-converts") ?? false, s.dateLine);
}

{
  const s = describeSubscription(
    sub({
      status: "active",
      providerSubscriptionId: "ls-99",
      currentPeriodEndsAt: new Date(NOW.getTime() + 30 * DAY).toISOString(),
    }),
    NOW,
  );
  log("active → 'Manage billing' (portal)", s.primaryCta.kind === "portal");
  log("active dateLine mentions renews", s.dateLine?.includes("Renews on") ?? false, s.dateLine);
  log("active badge tone info", s.badge.tone === "info");
}

{
  const s = describeSubscription(
    sub({
      status: "past_due",
      providerSubscriptionId: "ls-99",
      graceUntil: new Date(NOW.getTime() + 3 * DAY).toISOString(),
    }),
    NOW,
  );
  log("past_due in grace → 'Update payment' (portal) + warn tone", s.primaryCta.label === "Update payment" && s.badge.tone === "warn");
}

{
  const s = describeSubscription(
    sub({
      status: "past_due",
      providerSubscriptionId: "ls-99",
      graceUntil: new Date(NOW.getTime() - 1 * DAY).toISOString(),
    }),
    NOW,
  );
  log("past_due past grace → still 'Update payment' (portal)", s.primaryCta.label === "Update payment" && s.primaryCta.kind === "portal");
}

{
  const s = describeSubscription(
    sub({
      status: "canceled",
      providerSubscriptionId: "ls-99",
      graceUntil: new Date(NOW.getTime() + 5 * DAY).toISOString(),
      cancelAt: new Date(NOW.getTime() + 5 * DAY).toISOString(),
    }),
    NOW,
  );
  log("canceled in grace → 'Cancels at period end' / 'Resume' (portal)", s.badge.label === "Cancels at period end" && s.primaryCta.label === "Resume subscription" && s.primaryCta.kind === "portal");
}

{
  const s = describeSubscription(
    sub({
      status: "canceled",
      canceledAt: new Date(NOW.getTime() - 2 * DAY).toISOString(),
    }),
    NOW,
  );
  log("canceled hard → 'Restart subscription' (checkout) + critical tone", s.primaryCta.kind === "checkout" && s.primaryCta.label === "Restart subscription" && s.badge.tone === "critical");
}

{
  const s = describeSubscription(
    sub({
      status: "canceled",
      adminOverrideUntil: new Date(NOW.getTime() + 30 * DAY).toISOString(),
    }),
    NOW,
  );
  log("admin override beats canceled → 'Access granted (admin)'", s.badge.label === "Access granted (admin)");
}

{
  const s = describeSubscription(
    sub({
      status: "active",
      providerSubscriptionId: "ls-99",
      metadata: { cardBrand: "visa", cardLastFour: "4242" },
    }),
    NOW,
  );
  log("payment method line renders from metadata", s.paymentMethodLine === "Visa ending in 4242", s.paymentMethodLine);
}

{
  const s = describeSubscription(sub({ status: "active" }), NOW);
  log("no metadata → payment method line is null", s.paymentMethodLine === null);
}

console.log(`\n${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
