#!/usr/bin/env node
// Smoke test the create_owner_business RPC end-to-end against the live DB.
// Creates a throwaway auth user, calls the RPC as that user, checks the
// business + membership rows landed, then cleans up.

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
  console.error("Missing one of NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const stamp = Date.now();
const testEmail = `signup-smoke-${stamp}@example.test`;
const testPassword = `pw-${stamp}-XYZ!`;
const restaurantName = `Smoke Diner ${stamp}`;
const slugBase = "smoke-diner";

let userId = null;
let businessId = null;
let pass = true;
const log = (k, v, ok) => {
  pass = pass && ok;
  console.log(`  ${k.padEnd(28)} : ${v} ${ok ? "" : "FAIL"}`);
};

try {
  console.log("Smoke test: create_owner_business");
  console.log(`  test email                  : ${testEmail}`);

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
  log("RPC returned id", String(rpc.data ?? "(null)"), !rpc.error && !!rpc.data);
  if (rpc.error) throw new Error("rpc: " + rpc.error.message);
  businessId = rpc.data;

  const biz = await admin.from("businesses").select("id, name, slug").eq("id", businessId).single();
  log("business row exists", biz.data?.id === businessId ? "yes" : "no", biz.data?.id === businessId);
  log("name persisted", biz.data?.name ?? "(none)", biz.data?.name === restaurantName);
  log("slug looks reasonable", biz.data?.slug ?? "(none)", typeof biz.data?.slug === "string" && biz.data.slug.startsWith(slugBase));

  const member = await admin
    .from("business_members")
    .select("business_id, user_id, role_in_business")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();
  log("membership row exists", member.data ? "yes" : "no", !!member.data);
  log("role is owner", member.data?.role_in_business ?? "(none)", member.data?.role_in_business === "owner");

  const appUser = await admin
    .from("app_users")
    .select("user_id, is_super_admin")
    .eq("user_id", userId)
    .maybeSingle();
  log("app_users row exists", appUser.data ? "yes" : "no", !!appUser.data);
  log("not flagged super-admin", String(appUser.data?.is_super_admin ?? "(none)"), appUser.data?.is_super_admin === false);

  const second = await anon.rpc("create_owner_business", {
    p_name: restaurantName + " Two",
    p_slug_base: slugBase,
  });
  log("second call succeeds", String(second.data ?? "(null)"), !second.error && !!second.data);

  if (second.data) {
    const second_biz = await admin.from("businesses").select("slug").eq("id", second.data).single();
    log("slug differs from first", second_biz.data?.slug ?? "(none)", second_biz.data?.slug !== biz.data?.slug);
  }

  // Cleanup chain. businesses delete will cascade business_members.
  if (second.data) await admin.from("businesses").delete().eq("id", second.data);
} catch (err) {
  pass = false;
  console.error("ERROR:", err.message);
} finally {
  try {
    if (businessId) await admin.from("businesses").delete().eq("id", businessId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  } catch (cleanupErr) {
    console.error("cleanup error:", cleanupErr.message);
  }
}

console.log(`\n${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
