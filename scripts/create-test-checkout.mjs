#!/usr/bin/env node
// Exercises the outbound side of the billing adapter:
//   provider.createCheckoutUrl(...) → real POST to LS /v1/checkouts
//
// Prints a real LS test-mode checkout URL. Open it in a browser,
// complete with test card 4242 4242 4242 4242 / any future expiry /
// any CVC. LS will then fire a real subscription_created webhook
// through the ngrok tunnel into our handler — verifying the inbound
// path end-to-end with a real LS-originated payload.
//
// Targets "Phase 1 Test Bistro" (the second grandfather row, no
// provider_subscription_id yet) so we see a clean trialing → active
// flow on a separate business from the simulated test.

import "node:process";
import fs from "node:fs";

for (const p of [".env.local", ".env"]) {
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const { lemonSqueezyProvider } = await import("../lib/billing/lemonsqueezy.ts");

const BUSINESS_ID = "3ecb02f6-18ed-4a70-ac2a-d44c3414f2e8"; // Phase 1 Test Bistro
const USER_ID = "00000000-0000-0000-0000-000000000002";    // synthetic for custom_data
const NGROK = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

if (!lemonSqueezyProvider.isConfigured()) {
  console.error("LS provider not configured — missing env vars.");
  process.exit(1);
}

console.log("Creating LS test-mode checkout for business", BUSINESS_ID);
console.log("Custom data → { business_id, user_id }");
console.log("Success redirect →", `${NGROK}/dashboard/restaurants/${BUSINESS_ID}?billing=complete`);
console.log("");

try {
  const result = await lemonSqueezyProvider.createCheckoutUrl({
    businessId: BUSINESS_ID,
    userId: USER_ID,
    customerEmail: "test@example.com",
    successRedirectUrl: `${NGROK}/dashboard/restaurants/${BUSINESS_ID}?billing=complete`,
  });
  console.log("--- LS checkout URL ---");
  console.log(result.url);
  console.log("--- providerCheckoutId ---");
  console.log(result.providerCheckoutId);
  console.log("");
  console.log("Open the URL above. LS test card: 4242 4242 4242 4242");
  console.log("After completion, a real subscription_created webhook will fire");
  console.log("through the ngrok tunnel; the watcher will print it.");
} catch (err) {
  console.error("createCheckoutUrl failed:", err.message);
  console.error(err);
  process.exit(1);
}
