#!/usr/bin/env node
// Simulate Lemon Squeezy webhook deliveries against the local /ngrok
// endpoint. Signs each payload with LEMONSQUEEZY_WEBHOOK_SECRET the
// same way LS does (HMAC-SHA256 hex). The shape mirrors a real LS
// subscription webhook including meta.event_name and meta.custom_data.
//
// Use this to exercise the full pipeline (HMAC verify → parse →
// state machine → audit → row update) without needing LS to actually
// click "send test event" on their end.

import "node:process";
import fs from "node:fs";
import { createHmac } from "node:crypto";

for (const p of [".env.local", ".env"]) {
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
if (!SECRET) {
  console.error("LEMONSQUEEZY_WEBHOOK_SECRET missing");
  process.exit(1);
}

const TARGET = process.argv[2] ?? "http://localhost:3000/api/billing/webhook";
const BUSINESS_ID = "2374fb48-29d2-42d5-b652-3956fafc424b"; // "Test Restaurant" grandfather row.
const USER_ID = "00000000-0000-0000-0000-000000000001"; // synthetic — only stored in metadata.
const SUB_PROVIDER_ID = "ls_test_sub_" + Date.now(); // unique per script run.
const CUSTOMER_ID = "ls_test_cust_" + Date.now();

function sign(rawBody) {
  return createHmac("sha256", SECRET).update(rawBody, "utf8").digest("hex");
}

async function deliver(label, body) {
  const raw = JSON.stringify(body);
  const sig = sign(raw);
  const res = await fetch(TARGET, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": sig,
      "ngrok-skip-browser-warning": "1",
    },
    body: raw,
  });
  const text = await res.text();
  console.log(`  ${label.padEnd(34)} → ${res.status} ${text}`);
  return res.status;
}

function attrs(status, extras = {}) {
  return {
    store_id: 384858,
    customer_id: Number(CUSTOMER_ID.replace(/\D/g, "").slice(-6)) || 717668,
    order_id: 999111,
    product_id: 555444,
    variant_id: 1693819,
    product_name: "Reputation OS",
    variant_name: "Standard",
    user_name: "Test Customer",
    user_email: "test@example.com",
    status,
    status_formatted: status,
    card_brand: "visa",
    card_last_four: "4242",
    payment_processor: "stripe",
    pause: null,
    cancelled: status === "cancelled",
    trial_ends_at:
      status === "on_trial" ? new Date(Date.now() + 14 * 86400000).toISOString() : null,
    billing_anchor: 23,
    first_subscription_item: null,
    urls: {
      update_payment_method: "https://example.com/portal/update",
      customer_portal: "https://example.com/portal",
    },
    renews_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    ends_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    test_mode: true,
    ...extras,
  };
}

const meta = {
  test_mode: true,
  custom_data: {
    business_id: BUSINESS_ID,
    user_id: USER_ID,
  },
};

console.log(`Simulating LS deliveries to ${TARGET}\n`);

// Cache the on_trial attrs so the retry below uses the exact same
// updated_at — otherwise the synthetic idempotency key changes and
// the dedup test is meaningless.
const trialAttrs = attrs("on_trial");
const createdPayload = {
  meta: { ...meta, event_name: "subscription_created" },
  data: {
    type: "subscriptions",
    id: SUB_PROVIDER_ID,
    attributes: trialAttrs,
  },
};

// 1) subscription_created (on_trial)
await deliver("subscription_created (trial)", createdPayload);

// 2) order_created — exercises the ignored-event branch
await deliver("order_created (ignored)", {
  meta: { ...meta, event_name: "order_created" },
  data: {
    type: "orders",
    id: "ord_" + Date.now(),
    attributes: {
      store_id: 384858,
      customer_id: 717668,
      identifier: "abc-123",
      order_number: 1,
      user_email: "test@example.com",
      currency: "USD",
      currency_rate: "1.00",
      subtotal: 0,
      discount_total: 0,
      tax: 0,
      total: 0,
      status: "paid",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      test_mode: true,
    },
  },
});

// 3) subscription_updated to active — proves trialing → active transition
await deliver("subscription_updated (active)", {
  meta: { ...meta, event_name: "subscription_updated" },
  data: {
    type: "subscriptions",
    id: SUB_PROVIDER_ID,
    attributes: attrs("active"),
  },
});

// 4) Replay the first event verbatim to prove idempotency (200 + "duplicate")
await deliver("subscription_created (RETRY)", createdPayload);

console.log("\nDone. Watch the live tail for new rows.");
