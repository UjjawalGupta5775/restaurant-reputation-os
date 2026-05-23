#!/usr/bin/env node
// End-to-end verification of the logo RLS fix from migration 0007.
// Provisions a throwaway auth user + business membership, attempts to
// upload to {business_id}/logo as that user, and asserts the upload
// succeeds. Then attempts a foreign-prefix upload and asserts denial.
// Cleans up on exit (idempotent).

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

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

const TEST_EMAIL = `logo-rls-${Date.now()}@example.test`;
const TEST_PASSWORD = "Logo-Rls-Test-2026";
const TEST_BIZ_SLUG = `logo-rls-${Date.now()}`;

const admin = createClient(REST, SR, { auth: { persistSession: false } });

// 1x1 PNG (43 bytes)
const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6300010000000500010d0a2db40000000049454e44ae426082",
  "hex",
);

let createdUserId = null;
let createdBizId = null;
let uploadedPaths = [];

async function cleanup() {
  if (uploadedPaths.length) {
    await admin.storage.from("restaurant-logos").remove(uploadedPaths);
  }
  if (createdBizId) {
    await admin
      .from("business_members")
      .delete()
      .eq("business_id", createdBizId);
    await admin.from("businesses").delete().eq("id", createdBizId);
  }
  if (createdUserId) {
    await admin.auth.admin.deleteUser(createdUserId);
  }
}

async function main() {
  // 1. Provision a throwaway auth user (email-confirmed).
  const { data: u, error: ue } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (ue) throw new Error("createUser: " + ue.message);
  createdUserId = u.user.id;
  console.log("user:", TEST_EMAIL, createdUserId);

  // 2. Provision a business and membership.
  const { data: b, error: be } = await admin
    .from("businesses")
    .insert({
      name: "Logo RLS Test",
      slug: TEST_BIZ_SLUG,
    })
    .select("id")
    .single();
  if (be) throw new Error("biz insert: " + be.message);
  createdBizId = b.id;

  const { error: me } = await admin.from("business_members").insert({
    business_id: createdBizId,
    user_id: createdUserId,
    role_in_business: "owner",
  });
  if (me) throw new Error("member insert: " + me.message);
  console.log("biz:", createdBizId);

  // 3. Sign in as the new owner (anon client + password grant).
  const ownerClient = createClient(REST, ANON, {
    auth: { persistSession: false },
  });
  const { error: signInErr } = await ownerClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInErr) throw new Error("signin: " + signInErr.message);

  // 4. Upload to own path — must succeed.
  const ownPath = `${createdBizId}/logo`;
  const { error: upErr } = await ownerClient.storage
    .from("restaurant-logos")
    .upload(ownPath, PNG_BYTES, {
      contentType: "image/png",
      upsert: true,
    });
  uploadedPaths.push(ownPath);
  if (upErr) {
    console.log("FAIL — owner upload to own path was denied:", upErr.message);
    process.exitCode = 1;
  } else {
    console.log("PASS — owner upload to own path succeeded:", ownPath);
  }

  // 5. Upload to a foreign UUID prefix — must be denied.
  const foreign = `00000000-0000-0000-0000-000000000000/logo-${Date.now()}`;
  const { error: foreignErr } = await ownerClient.storage
    .from("restaurant-logos")
    .upload(foreign, PNG_BYTES, { contentType: "image/png", upsert: true });
  if (!foreignErr) {
    console.log("FAIL — owner could upload under foreign UUID");
    uploadedPaths.push(foreign);
    process.exitCode = 1;
  } else {
    console.log("PASS — foreign-prefix upload denied:", foreignErr.message);
  }
}

try {
  await main();
} catch (e) {
  console.log("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  await cleanup();
  console.log("cleanup ok");
  process.exit(process.exitCode ?? 0);
}
