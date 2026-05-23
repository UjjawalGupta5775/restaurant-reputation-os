#!/usr/bin/env node
/**
 * Apply a Supabase migration and verify it landed.
 *
 * Usage:
 *   node scripts/apply-migration.mjs <migration-file>
 *
 * Reads POSTGRES_URL from .env.local (Session pooler URI from
 * Supabase Dashboard → Project Settings → Database → Connection string).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Load .env.local manually — no dotenv dep needed
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
  console.error(
    "POSTGRES_URL not set in environment or .env.local.\n" +
      "Get it from Supabase Dashboard → Project Settings → Database\n" +
      "  → Connection string → Session pooler → URI.",
  );
  process.exit(2);
}

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error("Usage: node scripts/apply-migration.mjs <path-to-sql>");
  process.exit(2);
}

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
       where table_schema = 'public'
         and table_name in ('app_users','business_members')
       order by table_name`,
  );
  console.log(
    `  tables       : ${t.rows.map((r) => r.table_name).join(", ") || "(none)"} (expect: app_users, business_members)`,
  );

  const r = await client.query(
    `select routine_name from information_schema.routines
       where routine_schema = 'public'
         and routine_name in ('is_super_admin','has_business_access')
       order by routine_name`,
  );
  console.log(
    `  functions    : ${r.rows.map((x) => x.routine_name).join(", ") || "(none)"} (expect: has_business_access, is_super_admin)`,
  );

  const e = await client.query(
    `select typname from pg_type where typname = 'business_role'`,
  );
  console.log(
    `  enum         : ${e.rows.map((x) => x.typname).join(", ") || "(none)"} (expect: business_role)`,
  );

  const s = await client.query(
    `select tablename, rowsecurity from pg_tables
       where schemaname = 'public'
         and tablename in ('app_users','business_members')
       order by tablename`,
  );
  console.log("  RLS enabled  :");
  for (const row of s.rows) {
    console.log(`                 ${row.tablename}: ${row.rowsecurity}`);
  }

  const p = await client.query(
    `select tablename, count(*)::int as n from pg_policies
       where schemaname = 'public'
         and tablename in ('app_users','business_members')
       group by tablename order by tablename`,
  );
  console.log("  policy counts:");
  for (const row of p.rows) {
    console.log(`                 ${row.tablename}: ${row.n}`);
  }

  const ok =
    t.rows.length === 2 &&
    r.rows.length === 2 &&
    e.rows.length === 1 &&
    s.rows.every((row) => row.rowsecurity === true);

  console.log(`\n${ok ? "PASS" : "FAIL"} — verification`);
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
