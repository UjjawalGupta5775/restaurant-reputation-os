#!/usr/bin/env node
// State machine smoke test — pure unit checks against
// lib/billing/state.ts (hasOperationalAccess + evaluateAccess +
// deriveBanner). No DB. Runs offline.
//
// Exercises every combination relevant to the V1 banner-only UX:
//   - admin_override beats everything (including expired)
//   - trial in window allows access
//   - trial expired with no upgrade blocks access
//   - active allows access regardless of trial_ends_at
//   - past_due in grace allows access
//   - past_due past grace blocks
//   - canceled in grace allows access (cancel-at-period-end UX)
//   - canceled past grace blocks
//   - null subscription blocks

import { hasOperationalAccess, evaluateAccess, deriveBanner } from "../lib/billing/state.ts";

let pass = true;
const log = (label, ok, info) => {
  pass = pass && ok;
  console.log(`  ${label.padEnd(54)} ${ok ? "ok" : "FAIL"} ${info ?? ""}`);
};

const NOW = new Date("2026-05-23T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeSub(overrides) {
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

console.log("State machine smoke\n");

// --- access verdicts ---
{
  const sub = makeSub({
    status: "canceled",
    adminOverrideUntil: new Date(NOW.getTime() + 30 * DAY).toISOString(),
  });
  const v = evaluateAccess(sub, NOW);
  log("admin_override beats canceled", v.ok && v.reason === "admin_override", v.reason);
}

{
  const sub = makeSub({
    status: "trialing",
    trialEndsAt: new Date(NOW.getTime() + 5 * DAY).toISOString(),
  });
  const v = evaluateAccess(sub, NOW);
  log("trial in window allows access", v.ok && v.reason === "trial", v.reason);
}

{
  const sub = makeSub({
    status: "trialing",
    trialEndsAt: new Date(NOW.getTime() - 1 * DAY).toISOString(),
  });
  const v = evaluateAccess(sub, NOW);
  log("trial expired blocks access", !v.ok && v.reason === "expired", v.reason);
}

{
  const sub = makeSub({ status: "active" });
  const v = evaluateAccess(sub, NOW);
  log("active allows access", v.ok && v.reason === "active", v.reason);
}

{
  const sub = makeSub({
    status: "past_due",
    graceUntil: new Date(NOW.getTime() + 3 * DAY).toISOString(),
  });
  const v = evaluateAccess(sub, NOW);
  log("past_due in grace allows access", v.ok && v.reason === "past_due_grace", v.reason);
}

{
  const sub = makeSub({
    status: "past_due",
    graceUntil: new Date(NOW.getTime() - 1 * DAY).toISOString(),
  });
  const v = evaluateAccess(sub, NOW);
  log("past_due past grace blocks access", !v.ok && v.reason === "expired", v.reason);
}

{
  const sub = makeSub({
    status: "canceled",
    graceUntil: new Date(NOW.getTime() + 2 * DAY).toISOString(),
  });
  const v = evaluateAccess(sub, NOW);
  log("canceled in grace allows access", v.ok && v.reason === "cancel_grace", v.reason);
}

{
  const sub = makeSub({
    status: "canceled",
    graceUntil: new Date(NOW.getTime() - 1 * DAY).toISOString(),
  });
  const v = evaluateAccess(sub, NOW);
  log("canceled past grace blocks access", !v.ok && v.reason === "expired", v.reason);
}

{
  const v = evaluateAccess(null, NOW);
  log("null subscription blocks access", !v.ok && v.reason === "no_subscription", v.reason);
}

// --- banners ---
console.log("\nBanner derivation\n");

{
  const sub = makeSub({
    status: "trialing",
    trialEndsAt: new Date(NOW.getTime() + 20 * DAY).toISOString(),
  });
  const b = deriveBanner(sub, NOW);
  log("trial with >7 days left: no banner", b === null);
}

{
  const sub = makeSub({
    status: "trialing",
    trialEndsAt: new Date(NOW.getTime() + 3 * DAY).toISOString(),
  });
  const b = deriveBanner(sub, NOW);
  log("trial with ≤7 days: info banner", b?.tone === "info", b?.headline);
}

{
  // Card on file (provider sub exists) — LS trial auto-converts, no banner.
  const sub = makeSub({
    status: "trialing",
    trialEndsAt: new Date(NOW.getTime() + 3 * DAY).toISOString(),
    providerSubscriptionId: "ls-99",
  });
  const b = deriveBanner(sub, NOW);
  log("trial ≤7 days WITH provider sub: no banner", b === null);
}

{
  const sub = makeSub({
    status: "trialing",
    trialEndsAt: new Date(NOW.getTime() + 12 * HOUR).toISOString(),
  });
  const b = deriveBanner(sub, NOW);
  log("trial with ≤1 day: warn banner", b?.tone === "warn", b?.headline);
}

{
  const sub = makeSub({
    status: "trialing",
    trialEndsAt: new Date(NOW.getTime() - 1 * DAY).toISOString(),
  });
  const b = deriveBanner(sub, NOW);
  log("trial expired: critical banner", b?.tone === "critical", b?.headline);
}

{
  const sub = makeSub({ status: "active" });
  const b = deriveBanner(sub, NOW);
  log("active: no banner", b === null);
}

{
  const sub = makeSub({
    status: "past_due",
    graceUntil: new Date(NOW.getTime() + 2 * DAY).toISOString(),
  });
  const b = deriveBanner(sub, NOW);
  log("past_due in grace: warn banner", b?.tone === "warn" && b?.cta === "update_payment", b?.headline);
}

{
  const sub = makeSub({
    status: "past_due",
    graceUntil: new Date(NOW.getTime() - 1 * DAY).toISOString(),
  });
  const b = deriveBanner(sub, NOW);
  log("past_due past grace: critical banner", b?.tone === "critical" && b?.cta === "update_payment", b?.headline);
}

{
  const sub = makeSub({
    status: "canceled",
    graceUntil: new Date(NOW.getTime() + 5 * DAY).toISOString(),
  });
  const b = deriveBanner(sub, NOW);
  log("canceled in grace: warn banner", b?.tone === "warn" && b?.cta === "manage_billing", b?.headline);
}

{
  const sub = makeSub({
    status: "canceled",
    adminOverrideUntil: new Date(NOW.getTime() + 365 * DAY).toISOString(),
  });
  const b = deriveBanner(sub, NOW);
  log("admin_override: no banner shown", b === null);
}

// --- hasOperationalAccess convenience matches evaluateAccess ---
console.log("\nConsistency: hasOperationalAccess vs evaluateAccess\n");

const cases = [
  null,
  makeSub({ status: "active" }),
  makeSub({ status: "canceled" }),
  makeSub({ status: "canceled", adminOverrideUntil: new Date(NOW.getTime() + DAY).toISOString() }),
  makeSub({ status: "trialing", trialEndsAt: new Date(NOW.getTime() + DAY).toISOString() }),
];
for (const c of cases) {
  const v = evaluateAccess(c, NOW);
  const h = hasOperationalAccess(c, NOW);
  log(`consistency for status=${c?.status ?? "null"}`, v.ok === h, `${v.reason}`);
}

console.log(`\n${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
