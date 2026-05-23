#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const text = readFileSync(resolve(root, ".env.local"), "utf8");
for (const line of text.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const client = new pg.Client({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const t = await client.query(
  `select table_name from information_schema.tables
     where table_schema='public' and table_name in ('app_users','business_members')`,
);
const r = await client.query(
  `select routine_name from information_schema.routines
     where routine_schema='public' and routine_name in ('is_super_admin','has_business_access')`,
);
const e = await client.query(
  `select typname from pg_type where typname='business_role'`,
);
const p = await client.query(
  `select tablename, policyname from pg_policies
     where schemaname='public' and tablename in ('app_users','business_members')`,
);

console.log("tables   :", t.rows.map((x) => x.table_name));
console.log("functions:", r.rows.map((x) => x.routine_name));
console.log("enum     :", e.rows.map((x) => x.typname));
console.log("policies :", p.rows);

await client.end();
