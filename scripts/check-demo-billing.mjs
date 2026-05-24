#!/usr/bin/env node
// One-off: prints which businesses the demo owner can see, and the
// subscription state on each. Used to confirm banner visibility.
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

const DEMO_UID = "eb345ea9-babe-4c5d-885d-6dbdee4e9394";

const bm = await c.query(
  `select b.id, b.name, b.slug,
          s.status, s.trial_ends_at, s.grace_until, s.provider_subscription_id
     from business_members bm
     join businesses b on b.id = bm.business_id
     left join subscriptions s on s.business_id = b.id
    where bm.user_id = $1
    order by b.name`,
  [DEMO_UID],
);
console.log("Demo owner's businesses:");
console.table(bm.rows);

await c.end();
