#!/usr/bin/env node
// End-to-end LS-test-mode flow against the running dev server.
//
// Walks a SYNTHETIC subscription through every state transition V1
// cares about. We don't poison the real Phase 1 Test Bistro row —
// we mint a one-off business + subscription, sign each LS-shaped
// payload with the real webhook secret, POST to /api/billing/webhook
// at localhost:3000, then verify:
//   - subscriptions row reflects the expected state
//   - billing_webhook_events row landed with processed_at populated
//   - audit_log entry created (for kinds that audit)
//   - deriveBanner returns the expected verdict
//
// Idempotency: at the end we replay one of the earlier payloads and
// confirm the route short-circuits with "OK (duplicate)" and no new
// event row is inserted.
//
// Cleanup runs in finally: deletes audit_log, billing_webhook_events,
// subscription, and the temp business. Even on failure the DB is left
// as it was found.

import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";
import { deriveBanner } from "../lib/billing/state.ts";

for (const p of [".env.local", ".env"]) {
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const ORIGIN = process.env.SMOKE_ORIGIN ?? "http://localhost:3000";
const SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
if (!SECRET) {
  console.error("LEMONSQUEEZY_WEBHOOK_SECRET not set");
  process.exit(1);
}

// Demo super-admin user — already exists in auth.users, gives the
// temp business a valid owner_user_id FK target.
const OWNER_UID = "eb345ea9-babe-4c5d-885d-6dbdee4e9394";

const FAKE_SUB_ID = `flow-sub-${Date.now()}`;
const FAKE_CUSTOMER_ID = `flow-cust-${Date.now()}`;
const SLUG = `flow-test-${Date.now()}`;

let pass = true;
const fails = [];
function check(label, ok, info) {
  pass = pass && ok;
  if (!ok) fails.push(label);
  console.log(`  ${label.padEnd(64)} ${ok ? "ok" : "FAIL"} ${info ?? ""}`);
}

const c = new pg.Client({ connectionString: process.env.POSTGRES_URL });
await c.connect();

let businessId;
let subscriptionId;

try {
  // ---- Setup: temp business + temp subscription row ----
  // Note: ownership lives in business_members, not businesses.
  // The webhook handler doesn't read membership — it routes by
  // custom_data.business_id only — so we can skip business_members
  // for this smoke test.
  const biz = await c.query(
    `insert into businesses (name, slug, google_review_url)
       values ($1, $2, 'https://example.test')
       returning id`,
    [`Webhook Flow Test ${Date.now()}`, SLUG],
  );
  businessId = biz.rows[0].id;

  const sub = await c.query(
    `insert into subscriptions (business_id, provider, status, trial_ends_at)
       values ($1, 'lemonsqueezy', 'trialing',
               now() + interval '4 days')
       returning id`,
    [businessId],
  );
  subscriptionId = sub.rows[0].id;
  console.log(`Setup: businessId=${businessId} subId=${subscriptionId}\n`);

  // ---- Helpers ----
  function sign(rawBody) {
    return crypto.createHmac("sha256", SECRET).update(rawBody, "utf8").digest("hex");
  }

  async function post(rawBody) {
    const sig = sign(rawBody);
    const res = await fetch(`${ORIGIN}/api/billing/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": sig },
      body: rawBody,
    });
    const text = await res.text();
    return { status: res.status, body: text };
  }

  // Subscription-shaped LS payload (subscription_created/updated/cancelled/etc).
  function subPayload({
    eventName,
    lsStatus,
    updatedAt,
    trialEndsAt = null,
    renewsAt = null,
    cancelled = false,
    endsAt = null,
  }) {
    return JSON.stringify({
      meta: {
        event_name: eventName,
        custom_data: { business_id: businessId, user_id: OWNER_UID },
      },
      data: {
        type: "subscriptions",
        id: FAKE_SUB_ID,
        attributes: {
          store_id: 1,
          customer_id: Number(FAKE_CUSTOMER_ID.replace(/\D/g, "").slice(0, 9)) || 1,
          status: lsStatus,
          trial_ends_at: trialEndsAt,
          renews_at: renewsAt,
          cancelled,
          ends_at: endsAt,
          updated_at: updatedAt,
          created_at: updatedAt,
          urls: {
            customer_portal: "https://lemon.test/portal",
            update_payment_method: "https://lemon.test/update-card",
          },
          card_brand: "visa",
          card_last_four: "4242",
          payment_processor: "stripe",
        },
      },
    });
  }

  // Invoice-shaped LS payload (subscription_payment_success/_failed/_recovered).
  function invoicePayload({ eventName, paymentStatus, updatedAt }) {
    return JSON.stringify({
      meta: {
        event_name: eventName,
        custom_data: { business_id: businessId, user_id: OWNER_UID },
      },
      data: {
        type: "subscription-invoices",
        id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        attributes: {
          subscription_id: FAKE_SUB_ID,
          customer_id: 1,
          status: paymentStatus,
          updated_at: updatedAt,
          created_at: updatedAt,
        },
      },
    });
  }

  async function readSub() {
    const r = await c.query(
      `select status, trial_ends_at, current_period_ends_at, grace_until,
              admin_override_until, cancel_at, canceled_at,
              provider_customer_id, provider_subscription_id, metadata
         from subscriptions where id = $1`,
      [subscriptionId],
    );
    return r.rows[0];
  }

  async function eventCount(eventType) {
    const r = await c.query(
      `select count(*)::int as n from billing_webhook_events
         where event_type = $1
           and payload->'meta'->'custom_data'->>'business_id' = $2`,
      [eventType, businessId],
    );
    return r.rows[0].n;
  }

  async function lastEventRow(eventType) {
    const r = await c.query(
      `select provider_event_id, signature_valid, processed_at, error
         from billing_webhook_events
         where event_type = $1
           and payload->'meta'->'custom_data'->>'business_id' = $2
         order by received_at desc
         limit 1`,
      [eventType, businessId],
    );
    return r.rows[0];
  }

  async function auditCount(action) {
    const r = await c.query(
      `select count(*)::int as n from audit_log
         where action = $1 and business_id = $2`,
      [action, businessId],
    );
    return r.rows[0].n;
  }

  function subRowToRecord(row) {
    return {
      id: subscriptionId,
      businessId,
      provider: "lemonsqueezy",
      providerCustomerId: row.provider_customer_id,
      providerSubscriptionId: row.provider_subscription_id,
      status: row.status,
      trialEndsAt: row.trial_ends_at?.toISOString?.() ?? row.trial_ends_at,
      currentPeriodEndsAt:
        row.current_period_ends_at?.toISOString?.() ?? row.current_period_ends_at,
      graceUntil: row.grace_until?.toISOString?.() ?? row.grace_until,
      adminOverrideUntil:
        row.admin_override_until?.toISOString?.() ?? row.admin_override_until,
      cancelAt: row.cancel_at?.toISOString?.() ?? row.cancel_at,
      canceledAt: row.canceled_at?.toISOString?.() ?? row.canceled_at,
      metadata: row.metadata ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // ---------- Step 1: subscription_updated → active ----------
  console.log("Step 1: subscription_updated → active");
  {
    const renewsAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const updatedAt = new Date().toISOString();
    const body = subPayload({
      eventName: "subscription_updated",
      lsStatus: "active",
      updatedAt,
      renewsAt,
    });
    const r = await post(body);
    check("HTTP 200", r.status === 200, `${r.status} ${r.body}`);
    const row = await readSub();
    check("status=active", row.status === "active", row.status);
    check("provider_subscription_id set", row.provider_subscription_id === FAKE_SUB_ID);
    check(
      "current_period_ends_at set",
      row.current_period_ends_at !== null,
      String(row.current_period_ends_at),
    );
    const ev = await lastEventRow("subscription_updated");
    check("event row landed processed", ev?.processed_at != null);
    // No audit for subscription_updated unless status changed; trialing→active
    // is a real transition so we DO expect one.
    check(
      "audit entry recorded (trialing→active)",
      (await auditCount("subscription_updated")) === 1,
    );
    const banner = deriveBanner(subRowToRecord(row));
    check("banner is null (active)", banner === null, JSON.stringify(banner));
  }

  // ---------- Step 2: subscription_payment_success (must NOT corrupt) ----------
  console.log("\nStep 2: subscription_payment_success (status must stay active)");
  {
    const body = invoicePayload({
      eventName: "subscription_payment_success",
      paymentStatus: "paid",
      updatedAt: new Date(Date.now() + 1000).toISOString(),
    });
    const r = await post(body);
    check("HTTP 200", r.status === 200);
    const row = await readSub();
    // The bug we fixed in lib/billing/route.ts: payment events must not
    // write subscription-owned columns. Status, trial_ends_at,
    // current_period_ends_at, cancel_at, canceled_at should all remain
    // exactly what Step 1 left.
    check("status STILL active (no corruption)", row.status === "active", row.status);
    check("trial_ends_at unchanged (null)", row.trial_ends_at == null);
    const ev = await lastEventRow("subscription_payment_success");
    check("payment event row processed", ev?.processed_at != null);
    // subscription_payment_success deliberately does NOT audit (would
    // drown the log).
    check(
      "no audit entry for payment_success",
      (await auditCount("subscription_payment_success")) === 0,
    );
  }

  // ---------- Step 3: subscription_payment_failed → past_due grace ----------
  console.log("\nStep 3: subscription_payment_failed → grace populated");
  {
    const body = invoicePayload({
      eventName: "subscription_payment_failed",
      paymentStatus: "failed",
      updatedAt: new Date(Date.now() + 2000).toISOString(),
    });
    const r = await post(body);
    check("HTTP 200", r.status === 200);
    const row = await readSub();
    // payment_failed sets grace_until but does NOT write status — the
    // companion subscription_updated event is what flips status to
    // past_due. We assert grace was set.
    check("grace_until populated", row.grace_until != null, String(row.grace_until));
    check(
      "audit entry recorded",
      (await auditCount("subscription_payment_failed")) === 1,
    );
  }

  // ---------- Step 4: subscription_updated → past_due (status flip) ----------
  console.log("\nStep 4: subscription_updated → past_due");
  {
    const body = subPayload({
      eventName: "subscription_updated",
      lsStatus: "past_due",
      updatedAt: new Date(Date.now() + 3000).toISOString(),
      renewsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    });
    const r = await post(body);
    check("HTTP 200", r.status === 200);
    const row = await readSub();
    check("status=past_due", row.status === "past_due", row.status);
    check("grace_until still in future", row.grace_until != null);
    const banner = deriveBanner(subRowToRecord(row));
    check(
      "banner is warn (past_due in grace)",
      banner?.tone === "warn" && banner?.cta === "update_payment",
      banner?.headline,
    );
  }

  // ---------- Step 5: subscription_payment_recovered → grace cleared ----------
  console.log("\nStep 5: subscription_payment_recovered → grace cleared");
  {
    const body = invoicePayload({
      eventName: "subscription_payment_recovered",
      paymentStatus: "paid",
      updatedAt: new Date(Date.now() + 4000).toISOString(),
    });
    const r = await post(body);
    check("HTTP 200", r.status === 200);
    const row = await readSub();
    check("grace_until cleared", row.grace_until == null, String(row.grace_until));
    check(
      "audit entry recorded",
      (await auditCount("subscription_payment_recovered")) === 1,
    );
  }

  // ---------- Step 6: subscription_updated → active again ----------
  console.log("\nStep 6: subscription_updated → active (recovered)");
  {
    const body = subPayload({
      eventName: "subscription_updated",
      lsStatus: "active",
      updatedAt: new Date(Date.now() + 5000).toISOString(),
      renewsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    });
    const r = await post(body);
    check("HTTP 200", r.status === 200);
    const row = await readSub();
    check("status=active", row.status === "active", row.status);
    const banner = deriveBanner(subRowToRecord(row));
    check("banner is null", banner === null);
  }

  // ---------- Step 7: subscription_cancelled → cancel-at-period-end ----------
  console.log("\nStep 7: subscription_cancelled → cancel_at + grace = ends_at");
  {
    const endsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const body = subPayload({
      eventName: "subscription_cancelled",
      lsStatus: "cancelled",
      updatedAt: new Date(Date.now() + 6000).toISOString(),
      cancelled: true,
      endsAt,
    });
    const r = await post(body);
    check("HTTP 200", r.status === 200);
    const row = await readSub();
    check("status=canceled", row.status === "canceled", row.status);
    check("cancel_at set", row.cancel_at != null);
    check(
      "grace_until = ends_at (cancel-at-period-end)",
      row.grace_until != null &&
        Math.abs(
          new Date(row.grace_until).getTime() - new Date(endsAt).getTime(),
        ) < 1000,
    );
    check(
      "audit entry recorded",
      (await auditCount("subscription_canceled")) === 1,
    );
    const banner = deriveBanner(subRowToRecord(row));
    check(
      "banner is warn (cancel grace)",
      banner?.tone === "warn" && banner?.cta === "manage_billing",
      banner?.headline,
    );
  }

  // ---------- Step 8: subscription_resumed → active, grace cleared ----------
  console.log("\nStep 8: subscription_resumed → active, grace cleared");
  {
    const body = subPayload({
      eventName: "subscription_resumed",
      lsStatus: "active",
      updatedAt: new Date(Date.now() + 7000).toISOString(),
      renewsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      // cancelled defaults to false → adapter sets cancelAt=null → the
      // route writes cancel_at=null, clearing the previous value.
    });
    const r = await post(body);
    check("HTTP 200", r.status === 200);
    const row = await readSub();
    check("status=active", row.status === "active", row.status);
    check("grace_until cleared", row.grace_until == null);
    check("cancel_at cleared", row.cancel_at == null);
    check("audit entry recorded", (await auditCount("subscription_resumed")) === 1);
  }

  // ---------- Step 9: subscription_paused → past_due, grace populated ----------
  console.log("\nStep 9: subscription_paused → past_due");
  {
    const body = subPayload({
      eventName: "subscription_paused",
      lsStatus: "paused",
      updatedAt: new Date(Date.now() + 8000).toISOString(),
    });
    const r = await post(body);
    check("HTTP 200", r.status === 200);
    const row = await readSub();
    check("status=past_due (LS paused→past_due)", row.status === "past_due", row.status);
    check("grace_until populated", row.grace_until != null);
    check("audit entry recorded", (await auditCount("subscription_paused")) === 1);
  }

  // ---------- Step 10: subscription_unpaused → active, grace cleared ----------
  console.log("\nStep 10: subscription_unpaused → active");
  {
    const body = subPayload({
      eventName: "subscription_unpaused",
      lsStatus: "active",
      updatedAt: new Date(Date.now() + 9000).toISOString(),
      renewsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    });
    const r = await post(body);
    check("HTTP 200", r.status === 200);
    const row = await readSub();
    check("status=active", row.status === "active", row.status);
    check("grace_until cleared", row.grace_until == null);
    check("audit entry recorded", (await auditCount("subscription_unpaused")) === 1);
  }

  // ---------- Step 11: subscription_expired → canceled hard ----------
  console.log("\nStep 11: subscription_expired → canceled (hard end)");
  let lastExpiredBody;
  {
    const updatedAt = new Date(Date.now() + 10_000).toISOString();
    lastExpiredBody = subPayload({
      eventName: "subscription_expired",
      lsStatus: "expired",
      updatedAt,
    });
    const r = await post(lastExpiredBody);
    check("HTTP 200", r.status === 200);
    const row = await readSub();
    check("status=canceled", row.status === "canceled", row.status);
    check("canceled_at set", row.canceled_at != null);
    check("grace_until cleared", row.grace_until == null);
    check("audit entry recorded", (await auditCount("subscription_expired")) === 1);
    const banner = deriveBanner(subRowToRecord(row));
    check(
      "banner is critical (expired hard)",
      banner?.tone === "critical",
      banner?.headline,
    );
  }

  // ---------- Idempotency: replay last expired payload ----------
  console.log("\nIdempotency: replay subscription_expired payload");
  {
    const beforeRows = await eventCount("subscription_expired");
    const r = await post(lastExpiredBody);
    check("HTTP 200 on replay", r.status === 200);
    check("response body indicates duplicate", r.body.includes("duplicate"), r.body);
    const afterRows = await eventCount("subscription_expired");
    check(
      "no new event row inserted",
      afterRows === beforeRows,
      `before=${beforeRows} after=${afterRows}`,
    );
    check(
      "audit count unchanged after replay",
      (await auditCount("subscription_expired")) === 1,
    );
  }

  // ---------- Bad signature → 401 ----------
  console.log("\nBad signature: 401, no state change");
  {
    const updatedAt = new Date(Date.now() + 11_000).toISOString();
    const body = subPayload({
      eventName: "subscription_updated",
      lsStatus: "active",
      updatedAt,
    });
    const res = await fetch(`${ORIGIN}/api/billing/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": "deadbeef" },
      body,
    });
    check("HTTP 401 on bad signature", res.status === 401);
    const row = await readSub();
    check(
      "subscription status unchanged",
      row.status === "canceled",
      row.status,
    );
  }

  console.log(`\n${pass ? "PASS" : "FAIL"}${fails.length ? " — " + fails.length + " failure(s)" : ""}`);
  process.exitCode = pass ? 0 : 1;
} finally {
  if (businessId) {
    // Cleanup in dependency order. business_id has ON DELETE SET NULL
    // for audit_log and CASCADE for subscriptions, but billing_webhook_events
    // is independent — clean by payload->custom_data->business_id.
    await c.query(
      `delete from billing_webhook_events
         where payload->'meta'->'custom_data'->>'business_id' = $1`,
      [businessId],
    );
    await c.query(`delete from audit_log where business_id = $1`, [businessId]);
    await c.query(`delete from subscriptions where business_id = $1`, [businessId]);
    await c.query(`delete from businesses where id = $1`, [businessId]);
    console.log("Cleanup: removed business + subscription + event + audit rows");
  }
  await c.end();
}
