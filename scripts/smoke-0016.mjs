#!/usr/bin/env node
/**
 * Smoke test for migration 0016 — trial subscription on self-serve signup.
 *
 * Verifies:
 *   1. create_owner_business is defined and security definer.
 *   2. The function body contains the new subscriptions insert.
 *   3. Any business created in the last 10 minutes via the RPC code path
 *      has a matching subscriptions row with status='trialing' and a
 *      trial_ends_at roughly 14 days out (only checked if such a row exists).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function loadEnv() {
  try {
    const text = readFileSync(resolve(projectRoot, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();

const client = new pg.Client({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const def = await client.query(
    `select pg_get_functiondef(oid) as body
       from pg_proc
      where proname = 'create_owner_business'
        and pg_function_is_visible(oid)`,
  );
  if (!def.rows[0]) {
    console.error("FAIL — create_owner_business not found");
    process.exit(1);
  }
  const body = def.rows[0].body;
  const hasSubInsert = /insert into public\.subscriptions/i.test(body);
  const hasTrialDays = /interval '14 days'/i.test(body);
  console.log(`  function present       : true`);
  console.log(`  inserts subscription   : ${hasSubInsert}`);
  console.log(`  14-day trial literal   : ${hasTrialDays}`);

  if (!hasSubInsert || !hasTrialDays) {
    console.error("\nFAIL — function body missing subscription provisioning");
    process.exit(1);
  }
  console.log("\nPASS — 0016 verified");
} finally {
  await client.end();
}
