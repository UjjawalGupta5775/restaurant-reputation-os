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

const appUsers = await client.query(
  `select user_id, is_super_admin, created_at from public.app_users order by created_at`,
);
console.log("public.app_users:");
console.table(appUsers.rows);

const members = await client.query(
  `select business_id, user_id, role_in_business, created_at
     from public.business_members order by created_at`,
);
console.log("\npublic.business_members:");
console.table(members.rows);

const consistency = await client.query(
  `select
     (select count(*) from auth.users) as auth_users,
     (select count(*) from public.app_users) as app_users,
     (select count(*) from public.businesses) as businesses,
     (select count(*) from public.business_members) as business_members`,
);
console.log("\nconsistency check:");
console.table(consistency.rows);

const r = consistency.rows[0];
const pass = String(r.auth_users) === String(r.app_users);
console.log(pass ? "\nPASS — app_users matches auth.users" : "\nFAIL — row count mismatch");

await client.end();
