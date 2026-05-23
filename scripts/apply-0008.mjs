#!/usr/bin/env node
/**
 * Apply migration 0008 (funnel rate limits) and verify it landed.
 *
 * Usage:
 *   node scripts/apply-0008.mjs
 *
 * Reads POSTGRES_URL from .env.local.
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
  } catch {
    /* ignore */
  }
}
loadEnv();

const url = process.env.POSTGRES_URL;
if (!url) {
  console.error("POSTGRES_URL not set in .env.local.");
  process.exit(2);
}

const sqlPath = "supabase/migrations/0008_funnel_rate_limits.sql";
const sql = readFileSync(resolve(projectRoot, sqlPath), "utf8");

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`Applying ${sqlPath}...`);
  await client.query(sql);
  console.log("OK — migration applied without error.\n");

  console.log("Verification:");

  const t = await client.query(
    `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = 'funnel_rate_limits'`,
  );
  console.log(
    `  table        : ${t.rows.map((r) => r.table_name).join(", ") || "(none)"} (expect: funnel_rate_limits)`,
  );

  const r = await client.query(
    `select routine_name from information_schema.routines
       where routine_schema = 'public' and routine_name = 'check_funnel_rate_limit'`,
  );
  console.log(
    `  function     : ${r.rows.map((x) => x.routine_name).join(", ") || "(none)"} (expect: check_funnel_rate_limit)`,
  );

  const s = await client.query(
    `select tablename, rowsecurity from pg_tables
       where schemaname = 'public' and tablename = 'funnel_rate_limits'`,
  );
  console.log(`  RLS enabled  : ${s.rows[0]?.rowsecurity ?? "(none)"} (expect: true)`);

  const g = await client.query(
    `select grantee from information_schema.routine_privileges
       where routine_schema = 'public'
         and routine_name = 'check_funnel_rate_limit'
         and privilege_type = 'EXECUTE'
       order by grantee`,
  );
  console.log(
    `  grants       : ${g.rows.map((x) => x.grantee).join(", ") || "(none)"} (expect: anon, authenticated)`,
  );

  // Smoke test the function: 3 calls with max=2 should yield 2 allowed then 1 denied.
  const testKey = `__test__:${Date.now()}`;
  const r1 = await client.query(
    `select * from public.check_funnel_rate_limit($1, 2, 60)`,
    [testKey],
  );
  const r2 = await client.query(
    `select * from public.check_funnel_rate_limit($1, 2, 60)`,
    [testKey],
  );
  const r3 = await client.query(
    `select * from public.check_funnel_rate_limit($1, 2, 60)`,
    [testKey],
  );
  console.log(
    `  smoke test   : [allowed=${r1.rows[0].allowed}, ${r2.rows[0].allowed}, ${r3.rows[0].allowed}] (expect: true, true, false)`,
  );
  console.log(
    `                 retry_after on denial = ${r3.rows[0].retry_after_seconds}s (expect: ~60)`,
  );
  // Clean up the test row
  await client.query(`delete from public.funnel_rate_limits where key = $1`, [
    testKey,
  ]);

  const ok =
    t.rows.length === 1 &&
    r.rows.length === 1 &&
    s.rows[0]?.rowsecurity === true &&
    g.rows.length >= 2 &&
    r1.rows[0].allowed === true &&
    r2.rows[0].allowed === true &&
    r3.rows[0].allowed === false;

  console.log(`\n${ok ? "PASS" : "FAIL"} — verification`);
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
