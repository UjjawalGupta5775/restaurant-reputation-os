#!/usr/bin/env node
// Live tail of billing_webhook_events + subscriptions. Polls every 2s
// and prints new rows as LS deliveries arrive. Useful while verifying
// the test-mode webhook plumbing — much less friction than re-pasting
// SQL into Supabase.
//
// Run: node scripts/watch-billing-events.mjs
// Stop: Ctrl-C.

import "dotenv/config";
import pg from "pg";
import fs from "node:fs";

// dotenv won't load .env.local by default; mirror Next.js's behavior.
for (const p of [".env.local", ".env"]) {
  if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const url = process.env.POSTGRES_URL;
if (!url) {
  console.error("POSTGRES_URL missing in .env.local");
  process.exit(1);
}

// Pool, not Client: Supabase's pgbouncer drops idle long-lived sockets,
// so we let the pool open a fresh connection per query.
const pool = new pg.Pool({
  connectionString: url,
  max: 2,
  idleTimeoutMillis: 1000,
});
// Swallow pool-level errors (idle connection drops) so they don't kill the process.
pool.on("error", (err) => {
  console.error(`\x1b[33mpool warning: ${err.message}\x1b[0m`);
});
const client = pool;

const POLL_MS = 2000;
let seenEvents = new Set();
let seenSubChanges = new Map(); // sub.id → updated_at

const pad = (s, n) => String(s ?? "").padEnd(n).slice(0, n);
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

// Prime: load current state so we only print *new* rows on subsequent ticks.
{
  const ev = await client.query(
    `select provider, provider_event_id from billing_webhook_events order by received_at desc limit 200`,
  );
  for (const r of ev.rows) seenEvents.add(`${r.provider}:${r.provider_event_id}`);
  const subs = await client.query(`select id, updated_at from subscriptions`);
  for (const r of subs.rows) seenSubChanges.set(r.id, r.updated_at.toISOString?.() ?? String(r.updated_at));
  console.log(dim(`primed: ${seenEvents.size} events, ${seenSubChanges.size} subscriptions on file`));
}

console.log(
  dim("watching billing_webhook_events + subscriptions. Ctrl-C to stop.\n"),
);
console.log(
  "  " +
    pad("when", 11) +
    pad("event_type", 36) +
    pad("sig", 4) +
    pad("processed", 11) +
    "error",
);
console.log(dim("  " + "-".repeat(96)));

async function tick() {
  // New webhook event rows.
  const ev = await client.query(
    `select provider, provider_event_id, event_type, signature_valid, processed_at, error, received_at
     from billing_webhook_events
     order by received_at desc
     limit 50`,
  );
  const fresh = [];
  for (const r of ev.rows) {
    const key = `${r.provider}:${r.provider_event_id}`;
    if (!seenEvents.has(key)) {
      seenEvents.add(key);
      fresh.push(r);
    }
  }
  // Print oldest-to-newest within the batch.
  for (const r of fresh.reverse()) {
    const when = new Date(r.received_at).toISOString().slice(11, 19);
    const sigCell = r.signature_valid ? green("✓") : red("✗");
    const processedCell = r.processed_at ? green("yes") : (r.error ? red("err") : yellow("—"));
    const errCell = r.error ? red(r.error.slice(0, 60)) : "";
    console.log(
      "  " +
        pad(when, 11) +
        pad(r.event_type, 36) +
        pad(sigCell, 4) +
        pad(processedCell, 11) +
        errCell,
    );
  }

  // Subscription row state — show transitions when status / grace / trial changes.
  const subs = await client.query(
    `select id, business_id, status, trial_ends_at, current_period_ends_at, grace_until, admin_override_until, updated_at
     from subscriptions`,
  );
  for (const s of subs.rows) {
    const u = s.updated_at.toISOString?.() ?? String(s.updated_at);
    const prev = seenSubChanges.get(s.id);
    if (prev !== u) {
      seenSubChanges.set(s.id, u);
      if (prev) {
        // Skip the initial fingerprint set; only print actual transitions.
        const ts = new Date(u).toISOString().slice(11, 19);
        console.log(
          dim("  " + ts + "  ") +
            "sub " +
            s.id.slice(0, 8) +
            "  status=" +
            (s.status === "active" ? green(s.status) : s.status === "past_due" ? yellow(s.status) : s.status === "canceled" ? red(s.status) : s.status) +
            (s.trial_ends_at ? `  trial→${new Date(s.trial_ends_at).toISOString().slice(0, 10)}` : "") +
            (s.grace_until ? `  grace→${new Date(s.grace_until).toISOString().slice(0, 10)}` : "") +
            (s.admin_override_until && new Date(s.admin_override_until) > new Date() ? `  ${dim("(override)")}` : ""),
        );
      }
    }
  }
}

let stopped = false;
process.on("SIGINT", async () => {
  stopped = true;
  console.log(dim("\nstopping..."));
  await pool.end();
  process.exit(0);
});

while (!stopped) {
  try {
    await tick();
  } catch (err) {
    console.error(red("poll error: " + (err.message || err)));
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
