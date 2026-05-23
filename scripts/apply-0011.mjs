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
  resolve(projectRoot, "supabase/migrations/0011_self_serve_signup.sql"),
  "utf8",
);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  console.log("Applying 0011...");
  await client.query(sql);
  console.log("OK\n");

  const r = await client.query(
    `select pg_get_functiondef(p.oid) as def
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_owner_business'`,
  );
  const found = r.rows.length;
  const isDefiner = r.rows[0]?.def?.includes("SECURITY DEFINER");
  console.log(`  function found     : ${found} (expect: 1)`);
  console.log(`  security definer   : ${isDefiner} (expect: true)`);

  const acl = await client.query(
    `select has_function_privilege('authenticated', 'public.create_owner_business(text, text)', 'execute') as can_exec`,
  );
  console.log(`  authenticated EXECUTE: ${acl.rows[0].can_exec} (expect: true)`);

  const aclAnon = await client.query(
    `select has_function_privilege('anon', 'public.create_owner_business(text, text)', 'execute') as can_exec`,
  );
  console.log(`  anon EXECUTE          : ${aclAnon.rows[0].can_exec} (expect: false)`);

  const ok = found === 1 && isDefiner && acl.rows[0].can_exec === true && aclAnon.rows[0].can_exec === false;
  console.log(`\n${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
