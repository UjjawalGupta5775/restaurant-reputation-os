#!/usr/bin/env node
// Adapter parse smoke — exercises lemonSqueezyProvider.parseWebhookEvent
// against every LS event name the user enabled in the dashboard:
//
//   subscription_*  → returns a BillingEvent
//   order_*, customer_*, dispute_*, affiliate_*, license_key_*,
//   subscription_payment_refunded, subscription_plan_changed
//                   → returns IgnoredBillingEvent { ignored: true }
//   unknown event_name → throws (loudly, on purpose)
//
// No DB, no HTTP. Pure unit checks. Runs offline.

import { lemonSqueezyProvider } from "../lib/billing/lemonsqueezy.ts";

let pass = true;
const log = (label, ok, info) => {
  pass = pass && ok;
  console.log(`  ${label.padEnd(60)} ${ok ? "ok" : "FAIL"} ${info ?? ""}`);
};

function envelope(eventName, attributes = {}, custom = null) {
  return JSON.stringify({
    meta: {
      event_name: eventName,
      custom_data: custom ?? undefined,
    },
    data: {
      type: "subscriptions",
      id: "sub-test-1",
      attributes: {
        status: "active",
        updated_at: "2026-05-24T10:00:00Z",
        ...attributes,
      },
    },
  });
}

console.log("Adapter parse smoke\n");

// --- subscription events: become BillingEvents ---
{
  const ev = lemonSqueezyProvider.parseWebhookEvent(
    envelope("subscription_created", { status: "on_trial", trial_ends_at: "2026-06-07T00:00:00Z" }, {
      business_id: "biz-1",
      user_id: "user-1",
    }),
  );
  log("subscription_created → BillingEvent with mapped trialing",
    !("ignored" in ev) && ev.kind === "subscription_created" && ev.status === "trialing" && ev.businessId === "biz-1",
    ev.status);
}

{
  const ev = lemonSqueezyProvider.parseWebhookEvent(
    envelope("subscription_cancelled", { status: "cancelled", cancelled: true, ends_at: "2026-06-15T00:00:00Z" }),
  );
  log("subscription_cancelled → kind=subscription_canceled",
    !("ignored" in ev) && ev.kind === "subscription_canceled" && ev.status === "canceled" && ev.cancelAt === "2026-06-15T00:00:00Z",
    `${ev.kind} ${ev.status}`);
}

// subscription_payment_* events carry an INVOICE payload, not a
// subscription. The adapter must NOT try to map the invoice's status
// ("paid"/"failed") into a subscription status. status on the
// BillingEvent is a sentinel ("active"); the real subscription state
// is owned by subscription_created/updated events that fire alongside.
{
  const body = JSON.stringify({
    meta: { event_name: "subscription_payment_failed" },
    data: {
      type: "subscription-invoices",
      id: "inv-1",
      attributes: {
        subscription_id: 99887,
        status: "failed",
        updated_at: "2026-05-24T10:00:00Z",
      },
    },
  });
  const ev = lemonSqueezyProvider.parseWebhookEvent(body);
  log("subscription_payment_failed → sentinel status, real subId",
    !("ignored" in ev) &&
      ev.kind === "subscription_payment_failed" &&
      ev.status === "active" &&
      ev.providerStatus === "failed" &&
      ev.providerSubscriptionId === "99887" &&
      ev.trialEndsAt === null &&
      ev.currentPeriodEndsAt === null,
    `status=${ev.status} providerStatus=${ev.providerStatus} subId=${ev.providerSubscriptionId}`);
}

{
  const body = JSON.stringify({
    meta: { event_name: "subscription_payment_success" },
    data: {
      type: "subscription-invoices",
      id: "inv-2",
      attributes: {
        subscription_id: 99887,
        status: "paid",
        updated_at: "2026-05-24T10:00:00Z",
      },
    },
  });
  const ev = lemonSqueezyProvider.parseWebhookEvent(body);
  log("subscription_payment_success (status=paid) → sentinel, no corruption",
    !("ignored" in ev) &&
      ev.kind === "subscription_payment_success" &&
      ev.status === "active" &&
      ev.providerStatus === "paid" &&
      ev.providerSubscriptionId === "99887",
    `status=${ev.status}`);
}

// --- ignored events: no exception, no state change, stable idempotency key ---
const ignoredCases = [
  "order_created",
  "order_refunded",
  "customer_created",
  "customer_updated",
  "dispute_created",
  "dispute_resolved",
  "affiliate_activated",
  "license_key_created",
  "license_key_updated",
  "subscription_payment_refunded",
  "subscription_plan_changed",
];

console.log("");

for (const name of ignoredCases) {
  const body = JSON.stringify({
    meta: { event_name: name },
    data: { type: "x", id: "obj-99", attributes: { updated_at: "2026-05-24T10:00:00Z" } },
  });
  let ev;
  let threw = null;
  try {
    ev = lemonSqueezyProvider.parseWebhookEvent(body);
  } catch (e) {
    threw = e;
  }
  const ok =
    !threw &&
    ev &&
    "ignored" in ev &&
    ev.ignored === true &&
    ev.eventName === name &&
    typeof ev.providerEventId === "string" &&
    ev.providerEventId.startsWith(`${name}:`);
  log(`${name} → IgnoredBillingEvent`, ok, threw ? `threw: ${threw.message}` : ev?.providerEventId);
}

// --- idempotency key is stable across identical retries ---
{
  const body = JSON.stringify({
    meta: { event_name: "order_created" },
    data: { type: "orders", id: "ord-1", attributes: { updated_at: "2026-05-24T10:00:00Z" } },
  });
  const a = lemonSqueezyProvider.parseWebhookEvent(body);
  const b = lemonSqueezyProvider.parseWebhookEvent(body);
  log("ignored retry → same providerEventId (dedupable)",
    "ignored" in a && "ignored" in b && a.providerEventId === b.providerEventId,
    a.providerEventId);
}

// --- truly unknown event name still throws (so we notice schema changes) ---
{
  let threw = null;
  try {
    lemonSqueezyProvider.parseWebhookEvent(
      JSON.stringify({
        meta: { event_name: "some_new_thing_from_LS" },
        data: { type: "x", id: "1", attributes: {} },
      }),
    );
  } catch (e) {
    threw = e;
  }
  log("unknown event_name → throws", !!threw && /unhandled event_name/.test(threw.message), threw?.message);
}

// --- signature verification: matches LS HMAC-SHA256 hex spec ---
{
  // Set the secret in env for this check only.
  process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "test_secret_for_smoke";
  const body = '{"meta":{"event_name":"order_created"},"data":{"id":"1","attributes":{}}}';

  // Compute what LS would send.
  const { createHmac } = await import("node:crypto");
  const sig = createHmac("sha256", "test_secret_for_smoke").update(body, "utf8").digest("hex");

  const ok1 = lemonSqueezyProvider.verifyWebhookSignature({ rawBody: body, signatureHeader: sig });
  log("verifyWebhookSignature accepts matching hex HMAC", ok1 === true);

  const ok2 = lemonSqueezyProvider.verifyWebhookSignature({ rawBody: body, signatureHeader: "deadbeef" });
  log("verifyWebhookSignature rejects mismatched hex", ok2 === false);

  const ok3 = lemonSqueezyProvider.verifyWebhookSignature({ rawBody: body, signatureHeader: null });
  log("verifyWebhookSignature rejects missing header", ok3 === false);

  const ok4 = lemonSqueezyProvider.verifyWebhookSignature({ rawBody: body + " ", signatureHeader: sig });
  log("verifyWebhookSignature rejects tampered body", ok4 === false);
}

console.log(`\n${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
