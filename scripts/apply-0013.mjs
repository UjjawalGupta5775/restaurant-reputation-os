#!/usr/bin/env node
// Apply migration 0013 (billing subscriptions + webhook idempotency)
// and verify columns + RLS + policies + indexes + grandfather backfill.
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

const url = process.env.POSTGRES_URL;
if (!url) { console.error("POSTGRES_URL not set"); process.exit(2); }

const sql = readFileSync(
  resolve(projectRoot, "supabase/migrations/0013_billing_subscriptions.sql"),
  "utf8",
);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  console.log("Applying 0013...");
  try {
    await client.query(sql);
    console.log("OK\n");
  } catch (err) {
    // Idempotent re-runs: skip if the table or policies already exist.
    if (err.code === "42P07" || err.code === "42710") {
      console.log(`already applied (${err.code}); verifying...\n`);
      // The SQL file wraps everything in BEGIN/COMMIT, so on partial
      // failure we have to ROLLBACK to clear the aborted transaction
      // state before subsequent verification queries can run.
      try { await client.query("ROLLBACK"); } catch {}
    } else {
      try { await client.query("ROLLBACK"); } catch {}
      throw err;
    }
  }

  // --- subscriptions table ---
  const subCols = await client.query(
    `select column_name, data_type from information_schema.columns
      where table_schema='public' and table_name='subscriptions'
      order by ordinal_position`,
  );
  console.log(`subscriptions columns: ${subCols.rows.length} (expect: 15)`);
  for (const r of subCols.rows) console.log(`    ${r.column_name} :: ${r.data_type}`);

  const subRls = await client.query(
    `select relrowsecurity from pg_class
      where relname='subscriptions' and relnamespace=(select oid from pg_namespace where nspname='public')`,
  );
  const subRlsOn = subRls.rows[0]?.relrowsecurity === true;
  console.log(`\nsubscriptions RLS enabled: ${subRlsOn} (expect: true)`);

  const subPols = await client.query(
    `select policyname, cmd from pg_policies where schemaname='public' and tablename='subscriptions' order by policyname`,
  );
  console.log(`subscriptions policies: ${subPols.rows.length} (expect: 2 SELECT)`);
  for (const r of subPols.rows) console.log(`    ${r.policyname} (${r.cmd})`);

  const subIdx = await client.query(
    `select indexname from pg_indexes where schemaname='public' and tablename='subscriptions' order by indexname`,
  );
  console.log(`subscriptions indexes: ${subIdx.rows.length} (expect: 5 incl. pkey)`);
  for (const r of subIdx.rows) console.log(`    ${r.indexname}`);

  // --- billing_webhook_events table ---
  const whCols = await client.query(
    `select column_name, data_type from information_schema.columns
      where table_schema='public' and table_name='billing_webhook_events'
      order by ordinal_position`,
  );
  console.log(`\nbilling_webhook_events columns: ${whCols.rows.length} (expect: 9)`);
  for (const r of whCols.rows) console.log(`    ${r.column_name} :: ${r.data_type}`);

  const whRls = await client.query(
    `select relrowsecurity from pg_class
      where relname='billing_webhook_events' and relnamespace=(select oid from pg_namespace where nspname='public')`,
  );
  const whRlsOn = whRls.rows[0]?.relrowsecurity === true;
  console.log(`\nbilling_webhook_events RLS enabled: ${whRlsOn} (expect: true)`);

  const whPols = await client.query(
    `select policyname, cmd from pg_policies where schemaname='public' and tablename='billing_webhook_events' order by policyname`,
  );
  console.log(`billing_webhook_events policies: ${whPols.rows.length} (expect: 1 SELECT)`);
  for (const r of whPols.rows) console.log(`    ${r.policyname} (${r.cmd})`);

  const whIdx = await client.query(
    `select indexname from pg_indexes where schemaname='public' and tablename='billing_webhook_events' order by indexname`,
  );
  console.log(`billing_webhook_events indexes: ${whIdx.rows.length} (expect: 4 incl. pkey)`);
  for (const r of whIdx.rows) console.log(`    ${r.indexname}`);

  // --- grandfather backfill ---
  const business = await client.query(`select count(*)::int as n from public.businesses`);
  const subRows = await client.query(`select count(*)::int as n from public.subscriptions`);
  const backfilled = await client.query(
    `select count(*)::int as n from public.subscriptions
      where (metadata->>'backfill')::boolean = true
        and admin_override_until > now() + interval '4 years'`,
  );
  console.log(`\nbusinesses: ${business.rows[0].n}`);
  console.log(`subscriptions rows: ${subRows.rows[0].n}`);
  console.log(`backfilled (admin_override > 4y): ${backfilled.rows[0].n}`);

  const ok =
    subCols.rows.length === 15 &&
    subRlsOn &&
    subPols.rows.length === 2 &&
    subIdx.rows.length === 5 &&
    whCols.rows.length === 9 &&
    whRlsOn &&
    whPols.rows.length === 1 &&
    whIdx.rows.length === 4 &&
    subRows.rows[0].n >= business.rows[0].n &&
    backfilled.rows[0].n === business.rows[0].n;
  console.log(`\n${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
