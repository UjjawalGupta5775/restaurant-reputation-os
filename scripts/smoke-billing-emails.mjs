#!/usr/bin/env node
// Offline render smoke test for the billing email templates.
//
// Verifies:
//   - Every kind that should email returns a populated RenderedBillingEmail.
//   - Every kind that should NOT email (created, payment_success, updated)
//     returns null — so the dispatcher never accidentally fires on noisy
//     events.
//   - Subject and body interpolate the business name + cancel/period
//     dates we hand in.
//   - The CTA URL is built off appUrl + the per-kind path.
//   - HTML escapes business names that contain unsafe characters.

import {
  renderBillingEmail,
  shouldEmailForKind,
} from "../lib/billing/emails.ts";

let pass = true;
const log = (label, ok, info) => {
  pass = pass && ok;
  console.log(`  ${label.padEnd(60)} ${ok ? "ok" : "FAIL"} ${info ?? ""}`);
};

const baseInput = {
  businessName: "Phase 1 Test Bistro",
  trialEndsAt: null,
  currentPeriodEndsAt: "2026-06-01T00:00:00Z",
  cancelAt: "2026-06-01T00:00:00Z",
  appUrl: "https://app.example.com",
  businessId: "biz-1",
};

console.log("Billing email render\n");

const emailing = [
  "subscription_payment_failed",
  "subscription_payment_recovered",
  "subscription_canceled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
];

for (const kind of emailing) {
  const r = renderBillingEmail({ ...baseInput, kind });
  log(
    `${kind}: renders`,
    r !== null && r.subject.length > 0 && r.html.length > 0 && r.text.length > 0,
    r?.subject,
  );
  log(
    `${kind}: shouldEmailForKind agrees`,
    shouldEmailForKind(kind) === true,
  );
  log(
    `${kind}: subject contains business name`,
    r?.subject.includes("Phase 1 Test Bistro") ?? false,
  );
  log(
    `${kind}: CTA URL uses appUrl + dashPath`,
    (r?.html.includes("https://app.example.com/dashboard/restaurants/biz-1") ?? false) &&
      (r?.text.includes("https://app.example.com/dashboard/restaurants/biz-1") ?? false),
  );
}

console.log("\nNon-emailing kinds\n");

for (const kind of [
  "subscription_created",
  "subscription_updated",
  "subscription_payment_success",
]) {
  const r = renderBillingEmail({ ...baseInput, kind });
  log(`${kind}: returns null`, r === null);
  log(
    `${kind}: shouldEmailForKind=false`,
    shouldEmailForKind(kind) === false,
  );
}

console.log("\nCanceled email surfaces end date\n");

{
  const r = renderBillingEmail({
    ...baseInput,
    kind: "subscription_canceled",
    cancelAt: "2026-06-01T00:00:00Z",
  });
  log(
    "canceled mentions Jun 1, 2026",
    r?.text.includes("Jun 1, 2026") ?? false,
    r?.text.slice(0, 200),
  );
}

console.log("\nHTML escaping\n");

{
  const r = renderBillingEmail({
    ...baseInput,
    businessName: 'Bobby <script>"&\'</script>',
    kind: "subscription_payment_failed",
  });
  const html = r?.html ?? "";
  log(
    "raw <script> tag is escaped",
    !html.includes("<script>") && html.includes("&lt;script&gt;"),
  );
  log("ampersand escaped", html.includes("&amp;"));
}

console.log(`\n${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
