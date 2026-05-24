#!/usr/bin/env node
// Inspect the new signup: find the auth.users row for wenalah136@ameady.com,
// the business they own, the subscription row, and (via LS API) the
// customer record LS settled on after checkout.
import fs from "node:fs";
import pg from "pg";

for (const p of [".env.local", ".env"]) {
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const c = new pg.Client({ connectionString: process.env.POSTGRES_URL });
await c.connect();

const u = await c.query(
  `select id, email, created_at from auth.users where email = 'wenalah136@ameady.com'`,
);
console.log("auth.users:", u.rows);

if (u.rows[0]) {
  const uid = u.rows[0].id;
  const bm = await c.query(
    `select b.id, b.name, b.slug, b.created_at,
            s.status, s.trial_ends_at, s.current_period_ends_at,
            s.provider, s.provider_subscription_id, s.provider_customer_id, s.metadata
       from business_members bm
       join businesses b on b.id = bm.business_id
       left join subscriptions s on s.business_id = b.id
      where bm.user_id = $1
      order by b.created_at desc`,
    [uid],
  );
  console.log("\nbusinesses + subs for this user:");
  console.dir(bm.rows, { depth: 4 });

  // Show the most recent billing_webhook_events for this user/business.
  if (bm.rows[0]) {
    const ev = await c.query(
      `select event_type, processed_at, signature_valid,
              payload->'meta'->'custom_data' as custom_data,
              payload->'data'->'attributes'->>'user_email' as ls_user_email,
              payload->'data'->'attributes'->>'user_name' as ls_user_name,
              payload->'data'->'attributes'->>'customer_id' as ls_customer_id
         from billing_webhook_events
         order by received_at desc
         limit 8`,
    );
    console.log("\nrecent webhook events:");
    console.table(ev.rows);
  }
}

// Hit the LS API for the customer record to see what email LS stored.
const apiKey = process.env.LEMONSQUEEZY_API_KEY;
if (apiKey) {
  const customerId = "8818623";
  const res = await fetch(`https://api.lemonsqueezy.com/v1/customers/${customerId}`, {
    headers: {
      Accept: "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (res.ok) {
    const json = await res.json();
    const a = json?.data?.attributes ?? {};
    console.log("\nLS customer 8818623:");
    console.log("  email :", a.email);
    console.log("  name  :", a.name);
    console.log("  status:", a.status);
    console.log("  created_at:", a.created_at);
  } else {
    console.log("\nLS customer fetch failed:", res.status, await res.text().catch(() => ""));
  }
}

await c.end();
