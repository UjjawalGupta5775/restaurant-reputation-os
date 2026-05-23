#!/usr/bin/env node
// Cross-tenant E2E verification (Phase 4A, Step 9).
// Provisions a second business + a second auth user, signs them in as a
// restaurant owner, and verifies the RLS swap from migration 0003:
//   • Owner A sees only Business A; not Business B's data; can't write.
//   • Super-admin sees both.
//   • Anon firehose continues to insert.
// Cleans up the provisioned test rows on exit (idempotent).

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

const REST = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SUPER_ADMIN_ID = "eb345ea9-babe-4c5d-885d-6dbdee4e9394";
const SUPER_ADMIN_EMAIL = "bejeya3548@marineso.com";
const EXISTING_BIZ_ID = "3ecb02f6-18ed-4a70-ac2a-d44c3414f2e8"; // Phase 1 Test Bistro

const TEST_OWNER_EMAIL = `step9-owner-${Date.now()}@example.test`;
const TEST_OWNER_PASSWORD = "ZZ-step9-temp-password-9182";
const TEST_BIZ_NAME = "Step 9 Verification Diner";
const TEST_BIZ_SLUG = `step9-diner-${Date.now()}`;

function log(label, value) {
  console.log(label, typeof value === "string" ? value : JSON.stringify(value));
}

function pass(msg) {
  console.log("  PASS —", msg);
}
function fail(msg) {
  console.log("  FAIL —", msg);
  process.exitCode = 1;
}

async function adminFetch(path, init = {}) {
  return fetch(REST + path, {
    ...init,
    headers: {
      apikey: SR,
      Authorization: "Bearer " + SR,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}
async function asUser(token, path, init = {}) {
  return fetch(REST + path, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}
async function asAnon(path, init = {}) {
  return fetch(REST + path, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: "Bearer " + ANON,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

const pg_client = new pg.Client({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});
await pg_client.connect();

let testUserId = null;
let testBizId = null;

try {
  // ── Provision second tenant ──
  console.log("\n[setup] provisioning test owner + business …");

  const createUserRes = await adminFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: TEST_OWNER_EMAIL,
      password: TEST_OWNER_PASSWORD,
      email_confirm: true,
    }),
  });
  if (!createUserRes.ok) {
    throw new Error("createUser failed: " + (await createUserRes.text()));
  }
  const user = await createUserRes.json();
  testUserId = user.id;
  log("  owner user id:", testUserId);

  // Use service role / direct pg to bypass RLS for setup.
  await pg_client.query(
    `insert into public.businesses (name, slug)
     values ($1, $2) returning id`,
    [TEST_BIZ_NAME, TEST_BIZ_SLUG],
  ).then((r) => {
    testBizId = r.rows[0].id;
  });
  log("  test business id:", testBizId);

  await pg_client.query(
    `insert into public.app_users (user_id, is_super_admin) values ($1, false)
     on conflict (user_id) do nothing`,
    [testUserId],
  );
  await pg_client.query(
    `insert into public.business_members (business_id, user_id, role_in_business)
     values ($1, $2, 'owner')
     on conflict (business_id, user_id) do nothing`,
    [testBizId, testUserId],
  );

  // Seed a row of feedback into each business so cross-tenant reads have
  // something to either see or be denied.
  await pg_client.query(
    `insert into public.feedback_submissions (business_id, rating, feedback_text)
     values ($1, 5, 'step9 A'), ($2, 5, 'step9 B')`,
    [EXISTING_BIZ_ID, testBizId],
  );

  // ── Sign in as the test owner via password ──
  console.log("\n[auth] signing in as test owner …");
  const signInRes = await fetch(
    REST + "/auth/v1/token?grant_type=password",
    {
      method: "POST",
      headers: {
        apikey: ANON,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: TEST_OWNER_EMAIL,
        password: TEST_OWNER_PASSWORD,
      }),
    },
  );
  if (!signInRes.ok) {
    throw new Error("signIn failed: " + (await signInRes.text()));
  }
  const tokens = await signInRes.json();
  const ownerToken = tokens.access_token;
  log("  got JWT (len):", ownerToken.length);

  // ── Sign in as super-admin (to compare visibility) ──
  // Skipped: requires the user's password and they explicitly told us not
  // to reset/rotate credentials. We instead verify super-admin visibility
  // via direct pg with set-jwt-claims (same path the policy takes anyway).
  const adminClaims = { sub: SUPER_ADMIN_ID, role: "authenticated" };

  async function asPgAuth(claims, sql) {
    await pg_client.query("begin");
    try {
      await pg_client.query("set local role authenticated");
      await pg_client.query(
        "set local request.jwt.claims = '" +
          JSON.stringify(claims).replace(/'/g, "''") +
          "'",
      );
      return await pg_client.query(sql);
    } finally {
      await pg_client.query("rollback");
    }
  }

  // ── Assertions ──
  console.log("\n[verify] owner can read OWN business");
  {
    const r = await asUser(
      ownerToken,
      `/rest/v1/businesses?id=eq.${testBizId}&select=id,name`,
    );
    const body = await r.json();
    body.length === 1 && body[0].id === testBizId
      ? pass("owner sees own business")
      : fail(`expected 1 row of own business, got ${JSON.stringify(body)}`);
  }

  console.log("\n[verify] owner CANNOT read OTHER business");
  {
    const r = await asUser(
      ownerToken,
      `/rest/v1/businesses?id=eq.${EXISTING_BIZ_ID}&select=id,name`,
    );
    const body = await r.json();
    body.length === 0
      ? pass("owner sees zero rows of other business")
      : fail(`expected 0 rows, got ${JSON.stringify(body)}`);
  }

  console.log("\n[verify] owner can read OWN feedback");
  {
    const r = await asUser(
      ownerToken,
      `/rest/v1/feedback_submissions?business_id=eq.${testBizId}&select=id,feedback_text`,
    );
    const body = await r.json();
    body.length >= 1 && body.every((row) => row.feedback_text !== "step9 A")
      ? pass(`owner sees ${body.length} row(s) of own feedback`)
      : fail(`unexpected feedback rows: ${JSON.stringify(body)}`);
  }

  console.log("\n[verify] owner CANNOT read OTHER feedback");
  {
    const r = await asUser(
      ownerToken,
      `/rest/v1/feedback_submissions?business_id=eq.${EXISTING_BIZ_ID}&select=id,feedback_text`,
    );
    const body = await r.json();
    body.length === 0
      ? pass("owner sees zero feedback for other business")
      : fail(`expected 0 rows, got ${JSON.stringify(body)}`);
  }

  console.log("\n[verify] owner CANNOT insert a business (super-admin only)");
  {
    const r = await asUser(ownerToken, "/rest/v1/businesses", {
      method: "POST",
      body: JSON.stringify({
        name: "owner-tries-to-create",
        slug: "owner-tries-" + Date.now(),
      }),
    });
    r.status === 401 || r.status === 403
      ? pass(`owner blocked from insert (status ${r.status})`)
      : fail(`expected 401/403, got ${r.status}: ${await r.text()}`);
  }

  console.log("\n[verify] owner CANNOT update OWN business (read-only)");
  {
    const r = await asUser(
      ownerToken,
      `/rest/v1/businesses?id=eq.${testBizId}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ name: "owner-tries-to-rename" }),
      },
    );
    // RLS silently filters update to 0 rows, returning [] with 200.
    if (r.status === 200) {
      const body = await r.json();
      body.length === 0
        ? pass("owner update affected 0 rows (RLS filtered)")
        : fail(`expected 0 rows updated, got ${JSON.stringify(body)}`);
    } else if (r.status === 401 || r.status === 403) {
      pass(`owner blocked from update (status ${r.status})`);
    } else {
      fail(`unexpected status ${r.status}: ${await r.text()}`);
    }
  }

  console.log("\n[verify] owner CANNOT insert a campaign (super-admin only)");
  {
    const r = await asUser(ownerToken, "/rest/v1/campaigns", {
      method: "POST",
      body: JSON.stringify({
        business_id: testBizId,
        name: "owner-tries-campaign",
        slug: "owner-tries-" + Date.now(),
        source_type: "table",
      }),
    });
    r.status === 401 || r.status === 403
      ? pass(`owner blocked from campaign insert (status ${r.status})`)
      : fail(`expected 401/403, got ${r.status}: ${await r.text()}`);
  }

  console.log("\n[verify] anon firehose still works");
  {
    const r = await asAnon("/rest/v1/feedback_submissions", {
      method: "POST",
      body: JSON.stringify({
        business_id: testBizId,
        rating: 4,
        feedback_text: "step9 anon",
      }),
    });
    r.status === 201
      ? pass("anon feedback insert (201)")
      : fail(`expected 201, got ${r.status}: ${await r.text()}`);
  }
  {
    const r = await asAnon("/rest/v1/analytics_events", {
      method: "POST",
      body: JSON.stringify({
        business_id: testBizId,
        session_id: "22222222-2222-2222-2222-222222222222",
        event_type: "r_page_viewed",
      }),
    });
    r.status === 201
      ? pass("anon analytics insert (201)")
      : fail(`expected 201, got ${r.status}: ${await r.text()}`);
  }

  console.log("\n[verify] super-admin sees BOTH businesses (via pg jwt-claims)");
  {
    const r = await asPgAuth(
      adminClaims,
      `select id from public.businesses order by id`,
    );
    const ids = r.rows.map((x) => x.id);
    const seesA = ids.includes(EXISTING_BIZ_ID);
    const seesB = ids.includes(testBizId);
    seesA && seesB
      ? pass(`super-admin sees ${r.rowCount} businesses (both A and B)`)
      : fail(`super-admin visibility: seesA=${seesA} seesB=${seesB}`);
  }

  console.log("\n[verify] super-admin sees BOTH feedback streams");
  {
    const r = await asPgAuth(
      adminClaims,
      `select business_id, count(*)::int as n
         from public.feedback_submissions
         group by business_id order by business_id`,
    );
    console.log("  rows:", r.rows);
    r.rowCount >= 2 ? pass("super-admin sees feedback across tenants") : fail("expected >=2 business groups");
  }

  console.log("\n[verify] /r/[slug] funnel still loads through Next");
  {
    const r = await fetch("http://localhost:3000/r/phase1-test-bistro?c=table-5");
    r.status === 200
      ? pass("public funnel returns 200")
      : fail(`expected 200, got ${r.status}`);
  }
} catch (err) {
  console.error("\n[error]", err.message);
  process.exitCode = 1;
} finally {
  // ── Tear down ──
  console.log("\n[teardown] cleaning up test rows …");
  if (testBizId) {
    await pg_client.query(
      `delete from public.feedback_submissions where business_id = $1`,
      [testBizId],
    );
    await pg_client.query(
      `delete from public.feedback_submissions where business_id = $1 and feedback_text = 'step9 A'`,
      [EXISTING_BIZ_ID],
    );
    await pg_client.query(
      `delete from public.analytics_events where business_id = $1`,
      [testBizId],
    );
    await pg_client.query(
      `delete from public.business_members where business_id = $1`,
      [testBizId],
    );
    await pg_client.query(
      `delete from public.businesses where id = $1`,
      [testBizId],
    );
  }
  if (testUserId) {
    await pg_client.query(
      `delete from public.app_users where user_id = $1`,
      [testUserId],
    );
    // remove auth user via admin API
    await adminFetch(`/auth/v1/admin/users/${testUserId}`, {
      method: "DELETE",
    });
  }
  await pg_client.end();
  console.log("  done.");
}
