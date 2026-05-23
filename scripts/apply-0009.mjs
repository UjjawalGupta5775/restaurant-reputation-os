#!/usr/bin/env node
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
if (!url) {
  console.error("POSTGRES_URL not set in .env.local.");
  process.exit(2);
}

const sql = readFileSync(
  resolve(projectRoot, "supabase/migrations/0009_notification_preferences_and_digest_log.sql"),
  "utf8",
);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  console.log("Applying 0009...");
  await client.query(sql);
  console.log("OK\n");

  const t = await client.query(
    `select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name in ('notification_preferences','digest_log')
       order by table_name`,
  );
  console.log(`  tables       : ${t.rows.map(r => r.table_name).join(", ")} (expect: digest_log, notification_preferences)`);

  const r = await client.query(
    `select routine_name from information_schema.routines
       where routine_schema = 'public' and routine_name = 'unsubscribe_by_token'`,
  );
  console.log(`  function     : ${r.rows.map(x => x.routine_name).join(", ")} (expect: unsubscribe_by_token)`);

  const c = await client.query(`select count(*)::int as n from public.notification_preferences`);
  console.log(`  prefs rows   : ${c.rows[0].n} (backfilled for every existing auth user)`);

  const ok = t.rows.length === 2 && r.rows.length === 1;
  console.log(`\n${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
