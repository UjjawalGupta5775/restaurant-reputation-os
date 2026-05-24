#!/usr/bin/env node
// Regression test for the payment-status-corruption bug.
//
// Before the fix: a real LS subscription_payment_success arrived with
// data.attributes.status = "paid" (the invoice's status). The adapter
// blindly mapped that through mapLemonStatus, hitting the default
// branch which logged to Sentry and returned "past_due". The route
// then wrote status=past_due + grace_until=now+7d onto the trialing
// subscription, corrupting it.
//
// After the fix: the adapter recognizes subscription_payment_* events
// carry an INVOICE payload (data.type "subscription-invoices"), reads
// the real subscription id from attributes.subscription_id, treats
// the invoice's status as opaque (sentinel), and the route omits all
// subscription-owned columns from the update.
//
// This script:
//  1) Reads the current state of the Phase 1 Test Bistro sub.
//  2) Fires an LS-shaped subscription_payment_success against it.
//  3) Verifies the row's status / trial_ends_at / grace_until did not change.

import "node:process";
import fs from "node:fs";
import { createHmac } from "node:crypto";
import pg from "pg";

for (const p of [".env.local", ".env"]) {
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
const TARGET =
  process.argv[2] ??
  "https://birefringent-untechnically-freddy.ngrok-free.app/api/billing/webhook";
const BUSINESS_ID = "3ecb02f6-18ed-4a70-ac2a-d44c3414f2e8";

if (!SECRET) {
  console.error("LEMONSQUEEZY_WEBHOOK_SECRET missing");
  process.exit(1);
}

const c = new pg.Client({ connectionString: process.env.POSTGRES_URL });
await c.connect();

const before = (
  await c.query(
    "select status, trial_ends_at, grace_until from subscriptions where business_id = $1",
    [BUSINESS_ID],
  )
).rows[0];
console.log("Before:", before);

// LS-shaped subscription_payment_success — invoice payload.
const body = JSON.stringify({
  meta: {
    event_name: "subscription_payment_success",
    test_mode: true,
    custom_data: {
      business_id: BUSINESS_ID,
      user_id: "00000000-0000-0000-0000-000000000002",
    },
  },
  data: {
    type: "subscription-invoices",
    id: "inv_regression_" + Date.now(),
    attributes: {
      store_id: 384858,
      subscription_id: 999111777, // arbitrary; won't match anything, but custom_data routes
      customer_id: 717668,
      status: "paid",
      status_formatted: "Paid",
      currency: "USD",
      subtotal: 0,
      tax: 0,
      total: 0,
      refunded: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      test_mode: true,
    },
  },
});

const sig = createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
const res = await fetch(TARGET, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-signature": sig,
    "ngrok-skip-browser-warning": "1",
  },
  body,
});
console.log(`HTTP ${res.status} ${await res.text()}`);

// Give the handler a beat to commit.
await new Promise((r) => setTimeout(r, 1000));

const after = (
  await c.query(
    "select status, trial_ends_at, grace_until from subscriptions where business_id = $1",
    [BUSINESS_ID],
  )
).rows[0];
console.log("After: ", after);

const sameStatus = before.status === after.status;
const sameTrial =
  String(before.trial_ends_at ?? "") === String(after.trial_ends_at ?? "");
const sameGrace =
  String(before.grace_until ?? "") === String(after.grace_until ?? "");

console.log("");
console.log("status unchanged       :", sameStatus ? "ok" : "FAIL");
console.log("trial_ends_at unchanged:", sameTrial ? "ok" : "FAIL");
console.log("grace_until unchanged  :", sameGrace ? "ok" : "FAIL");

await c.end();
process.exit(sameStatus && sameTrial && sameGrace ? 0 : 1);
