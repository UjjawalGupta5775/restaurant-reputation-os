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

const users = await client.query(
  `select id, email, created_at from auth.users order by created_at`,
);
console.log("auth.users:");
console.table(users.rows);

const businesses = await client.query(
  `select id, name, slug from public.businesses order by created_at`,
);
console.log("\npublic.businesses:");
console.table(businesses.rows);

await client.end();
