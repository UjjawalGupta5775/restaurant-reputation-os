#!/usr/bin/env node
// End-to-end render verification for the billing banner.
//
//   1. Logs in as the demo owner against the live dev server.
//   2. Snapshots current trial_ends_at on Phase 1 Test Bistro.
//   3. Sets trial_ends_at to 4 days out → derives an info banner.
//   4. Fetches /dashboard/restaurants/{id} with the auth cookie.
//   5. Confirms the banner copy + CTA appear in the HTML.
//   6. Restores trial_ends_at.
//
// Runs against localhost:3000 by default.

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

const ORIGIN = process.argv[2] ?? "http://localhost:3000";
const BUSINESS_ID = "3ecb02f6-18ed-4a70-ac2a-d44c3414f2e8";
const EMAIL = process.env.DEMO_OWNER_EMAIL;
const PASSWORD = process.env.DEMO_OWNER_PASSWORD;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!EMAIL || !PASSWORD) {
  console.error(
    "Missing DEMO_OWNER_EMAIL or DEMO_OWNER_PASSWORD. Set these in .env.local — see .env.local.example.",
  );
  process.exit(1);
}

if (!SB_URL || !SB_ANON) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const c = new pg.Client({ connectionString: process.env.POSTGRES_URL });
await c.connect();

const DEMO_UID = "eb345ea9-babe-4c5d-885d-6dbdee4e9394";

const before = (
  await c.query(
    "select trial_ends_at, provider_subscription_id from subscriptions where business_id = $1",
    [BUSINESS_ID],
  )
).rows[0];
console.log("Snapshot trial_ends_at:", before.trial_ends_at);
console.log("Snapshot provider_subscription_id:", before.provider_subscription_id);

const beforeAdmin = (
  await c.query("select is_super_admin from app_users where user_id = $1", [DEMO_UID])
).rows[0];
console.log("Snapshot is_super_admin:", beforeAdmin.is_super_admin);

// Demote so /dashboard layout doesn't bounce us to /admin during the
// owner-surface check. Restored in the finally block.
await c.query("update app_users set is_super_admin = false where user_id = $1", [DEMO_UID]);

// 4 days out → info banner ("Trial ends in 4 days"). Clear
// provider_subscription_id too: deriveBanner suppresses the trial
// banner when a card is on file, so to verify the info-banner render
// path we have to simulate the pre-checkout state.
const fourDaysOut = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
await c.query(
  "update subscriptions set trial_ends_at = $2, provider_subscription_id = null where business_id = $1",
  [BUSINESS_ID, fourDaysOut],
);
console.log("Set trial_ends_at to", fourDaysOut, "and cleared provider_subscription_id");

try {
  // Log in via Supabase Auth REST → returns access_token + refresh_token.
  const tokenRes = await fetch(
    `${SB_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: SB_ANON,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    },
  );
  if (!tokenRes.ok) {
    throw new Error(`auth/v1/token: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const tokens = await tokenRes.json();

  // The Supabase SSR cookie name format is sb-<project-ref>-auth-token,
  // value is a base64-encoded JSON of the session shape.
  const projectRef = new URL(SB_URL).host.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const sessionPayload = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at,
    expires_in: tokens.expires_in,
    token_type: tokens.token_type,
    user: tokens.user,
  };
  const cookieValue = `base64-${Buffer.from(JSON.stringify(sessionPayload), "utf8").toString("base64")}`;
  const cookie = `${cookieName}=${encodeURIComponent(cookieValue)}`;

  // Fetch the dashboard page with the auth cookie.
  const pageRes = await fetch(
    `${ORIGIN}/dashboard/restaurants/${BUSINESS_ID}`,
    {
      headers: { cookie, "ngrok-skip-browser-warning": "1" },
      redirect: "manual",
    },
  );
  const html = await pageRes.text();
  console.log(`HTTP ${pageRes.status} (${html.length} bytes)`);
  if (pageRes.status >= 300 && pageRes.status < 400) {
    console.log("Location:", pageRes.headers.get("location"));
  }

  const checks = [
    ["page returned 200", pageRes.status === 200],
    ["contains 'Trial ends in 4 days'", html.includes("Trial ends in 4 days")],
    ["contains 'Subscribe now' CTA", html.includes("Subscribe now")],
    ["form posts a server action", /<form[^>]*action="[^"]*"/.test(html)],
    ["restaurant name renders", html.includes("Phase 1 Test Bistro")],
  ];

  let pass = true;
  console.log("");
  for (const [label, ok] of checks) {
    if (!ok) pass = false;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  }

  if (!pass) {
    console.log("\n--- response head ---");
    console.log(html.slice(0, 1200));
  }

  console.log(`\n${pass ? "PASS" : "FAIL"}`);
  process.exitCode = pass ? 0 : 1;
} finally {
  await c.query(
    "update subscriptions set trial_ends_at = $2, provider_subscription_id = $3 where business_id = $1",
    [BUSINESS_ID, before.trial_ends_at, before.provider_subscription_id],
  );
  console.log(
    "Restored trial_ends_at to",
    before.trial_ends_at,
    "and provider_subscription_id to",
    before.provider_subscription_id,
  );
  await c.query(
    "update app_users set is_super_admin = $2 where user_id = $1",
    [DEMO_UID, beforeAdmin.is_super_admin],
  );
  console.log("Restored is_super_admin to", beforeAdmin.is_super_admin);
  await c.end();
}
