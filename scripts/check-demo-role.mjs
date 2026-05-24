#!/usr/bin/env node
import fs from "node:fs";
import pg from "pg";

for (const p of [".env.local", ".env"]) {
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const c = new pg.Client({ connectionString: process.env.POSTGRES_URL });
await c.connect();
const r = await c.query(
  `select * from app_users where user_id = 'eb345ea9-babe-4c5d-885d-6dbdee4e9394'`,
);
console.log(r.rows);
const cols = await c.query(
  `select column_name from information_schema.columns where table_name = 'app_users'`,
);
console.log("app_users columns:", cols.rows.map((r) => r.column_name));
await c.end();
