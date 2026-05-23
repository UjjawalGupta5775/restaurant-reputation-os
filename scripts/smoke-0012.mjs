#!/usr/bin/env node
// Smoke test the audit_log table by exercising create_owner_business
// directly (the easiest sensitive action to trigger end-to-end) and
// then writing an audit row via service role — confirming both the
// table accepts service-role inserts AND that authenticated reads are
// gated by RLS.
//
// Note: the application records audits via lib/audit.ts inside server
// actions. Triggering those from here would require driving the Next
// dev server. Instead we directly insert via service role (which is
// what lib/audit.ts does anyway) and assert RLS on read.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const stamp = Date.now();
const testEmail = `audit-smoke-${stamp}@example.test`;
const testPassword = `pw-${stamp}-XYZ!`;
const restaurantName = `Audit Diner ${stamp}`;
const slugBase = `audit-diner-${stamp}`;

let userId = null;
let businessId = null;
let auditId = null;
let otherUserId = null;
let otherBusinessId = null;
let pass = true;
const log = (k, v, ok) => {
  pass = pass && ok;
  console.log(`  ${k.padEnd(36)} : ${v} ${ok ? "" : "FAIL"}`);
};

try {
  console.log("Smoke test: audit_log\n");

  // Provision a fresh owner + business so we have known FKs to bind to.
  const created = await admin.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });
  if (created.error || !created.data.user) throw new Error("createUser: " + (created.error?.message ?? "no user"));
  userId = created.data.user.id;

  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const signedIn = await anon.auth.signInWithPassword({ email: testEmail, password: testPassword });
  if (signedIn.error || !signedIn.data.session) throw new Error("signIn: " + (signedIn.error?.message ?? "no session"));

  const rpc = await anon.rpc("create_owner_business", {
    p_name: restaurantName,
    p_slug_base: slugBase,
  });
  if (rpc.error || !rpc.data) throw new Error("rpc: " + (rpc.error?.message ?? "no id"));
  businessId = rpc.data;

  // Service-role insert into audit_log — this is what lib/audit.ts does.
  const ins = await admin
    .from("audit_log")
    .insert({
      actor_user_id: userId,
      business_id: businessId,
      action: "business_created",
      target_type: "business",
      target_id: businessId,
      metadata: { name: restaurantName, scope: "owner_self_serve", smoke: true },
    })
    .select("id")
    .single();
  log("service insert ok", ins.error ? ins.error.message : "yes", !ins.error && !!ins.data);
  if (ins.data) auditId = ins.data.id;

  // Same authed user reads — should see the row (owner_select policy).
  const ownerRead = await anon
    .from("audit_log")
    .select("id, action, business_id")
    .eq("id", auditId)
    .maybeSingle();
  log("owner can read own audit row", ownerRead.data ? "yes" : "no", !!ownerRead.data && ownerRead.data.action === "business_created");

  // Create a second user (no membership on businessId) and assert they
  // CANNOT see the row.
  const otherEmail = `audit-other-${stamp}@example.test`;
  const otherCreated = await admin.auth.admin.createUser({
    email: otherEmail,
    password: testPassword,
    email_confirm: true,
  });
  if (otherCreated.error || !otherCreated.data.user) throw new Error("other createUser: " + (otherCreated.error?.message ?? ""));
  otherUserId = otherCreated.data.user.id;

  const otherAnon = createClient(url, anonKey, { auth: { persistSession: false } });
  await otherAnon.auth.signInWithPassword({ email: otherEmail, password: testPassword });
  // Give the other user their own business so they have a real session
  // and a non-empty business_members set — closer to production shape.
  const otherRpc = await otherAnon.rpc("create_owner_business", {
    p_name: `Other Diner ${stamp}`,
    p_slug_base: `other-diner-${stamp}`,
  });
  if (!otherRpc.error && otherRpc.data) otherBusinessId = otherRpc.data;

  const stranger = await otherAnon
    .from("audit_log")
    .select("id")
    .eq("id", auditId)
    .maybeSingle();
  log("stranger CANNOT read foreign audit", stranger.data ? "leaked!" : "blocked", !stranger.data);

  // Attempt INSERT as an authenticated client — must be denied (no
  // insert policy exists). Both an explicit-actor and a null-actor
  // attempt should fail.
  const forge = await anon
    .from("audit_log")
    .insert({
      actor_user_id: userId,
      business_id: businessId,
      action: "business_created",
      metadata: { forged: true },
    });
  log("client INSERT is blocked", forge.error ? forge.error.code ?? "denied" : "ALLOWED", !!forge.error);
} catch (err) {
  pass = false;
  console.error("ERROR:", err.message);
} finally {
  try {
    if (auditId) await admin.from("audit_log").delete().eq("id", auditId);
    if (businessId) await admin.from("businesses").delete().eq("id", businessId);
    if (otherBusinessId) await admin.from("businesses").delete().eq("id", otherBusinessId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (otherUserId) await admin.auth.admin.deleteUser(otherUserId);
  } catch (cleanupErr) {
    console.error("cleanup error:", cleanupErr.message);
  }
}

console.log(`\n${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
