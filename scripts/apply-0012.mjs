#!/usr/bin/env node
// Apply migration 0012 (audit_log) and verify table + policies landed.
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
  resolve(projectRoot, "supabase/migrations/0012_audit_log.sql"),
  "utf8",
);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  console.log("Applying 0012...");
  try {
    await client.query(sql);
    console.log("OK\n");
  } catch (err) {
    // Idempotent re-runs: skip if the table or policies already exist.
    if (err.code === "42P07" || err.code === "42710") {
      console.log(`already applied (${err.code}); verifying...\n`);
    } else {
      throw err;
    }
  }

  const cols = await client.query(
    `select column_name, data_type from information_schema.columns
      where table_schema='public' and table_name='audit_log'
      order by ordinal_position`,
  );
  console.log(`  columns: ${cols.rows.length} (expect: 8)`);
  for (const r of cols.rows) console.log(`    ${r.column_name} :: ${r.data_type}`);

  const rls = await client.query(
    `select relrowsecurity from pg_class
      where relname='audit_log' and relnamespace=(select oid from pg_namespace where nspname='public')`,
  );
  const rlsOn = rls.rows[0]?.relrowsecurity === true;
  console.log(`\n  RLS enabled: ${rlsOn} (expect: true)`);

  const pols = await client.query(
    `select policyname, cmd from pg_policies where schemaname='public' and tablename='audit_log' order by policyname`,
  );
  console.log(`  policies: ${pols.rows.length} (expect: 2)`);
  for (const r of pols.rows) console.log(`    ${r.policyname} (${r.cmd})`);

  const idx = await client.query(
    `select indexname from pg_indexes where schemaname='public' and tablename='audit_log' order by indexname`,
  );
  console.log(`  indexes: ${idx.rows.length} (expect: 4 incl. pkey)`);
  for (const r of idx.rows) console.log(`    ${r.indexname}`);

  const ok =
    cols.rows.length === 8 &&
    rlsOn &&
    pols.rows.length === 2 &&
    idx.rows.length === 4;
  console.log(`\n${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
