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
if (!url) { console.error("POSTGRES_URL not set"); process.exit(2); }

const sql = readFileSync(
  resolve(projectRoot, "supabase/migrations/0010_response_templates.sql"),
  "utf8",
);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  console.log("Applying 0010...");
  await client.query(sql);
  console.log("OK\n");

  const t = await client.query(
    `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = 'response_templates'`,
  );
  console.log(`  table     : ${t.rows.map(r => r.table_name).join(", ")} (expect: response_templates)`);

  const p = await client.query(
    `select policyname from pg_policies where tablename = 'response_templates'`,
  );
  console.log(`  policies  : ${p.rows.map(x => x.policyname).join(", ")}`);

  const ok = t.rows.length === 1 && p.rows.length >= 1;
  console.log(`\n${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
