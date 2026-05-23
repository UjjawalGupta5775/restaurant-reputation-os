"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/dal";

export type OwnerActionState =
  | {
      error?: string;
      info?: string;
      fieldErrors?: Record<string, string[]>;
    }
  | undefined;

const inviteSchema = z.object({
  businessId: z.uuid("Invalid restaurant id."),
  email: z.email("Enter a valid email."),
});

const removeSchema = z.object({
  businessId: z.uuid(),
  userId: z.uuid(),
});

function collectFieldErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string") continue;
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

// Look up an existing auth user by email. Supabase admin's listUsers does
// not accept a server-side email filter, so we fetch the first page (100
// users) and match locally. Adequate for current scale; revisit when the
// user count crosses a few hundred.
async function findUserByEmail(
  email: string,
): Promise<{ id: string; lastSignInAt: string | null } | null> {
  const lowered = email.toLowerCase();
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error || !data) return null;
  const match = data.users.find(
    (u) => (u.email ?? "").toLowerCase() === lowered,
  );
  if (!match) return null;
  return { id: match.id, lastSignInAt: match.last_sign_in_at ?? null };
}

async function emitPlatformEvent(
  businessId: string,
  eventType: "owner_invited" | "owner_removed",
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await supabaseAdmin.from("analytics_events").insert({
      business_id: businessId,
      session_id: randomUUID(),
      event_type: eventType,
      metadata_json: metadata,
    });
  } catch {
    // Analytics never blocks a platform action.
  }
}

export async function inviteOwner(
  _prev: OwnerActionState,
  formData: FormData,
): Promise<OwnerActionState> {
  const session = await requireSuperAdmin();

  const parsed = inviteSchema.safeParse({
    businessId: formData.get("businessId"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error) };
  }

  const { businessId, email } = parsed.data;

  // Sanity: the restaurant exists. Uses service role so super-admin
  // visibility doesn't depend on the upcoming RLS swap.
  const { data: business } = await supabaseAdmin
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .maybeSingle();
  if (!business) {
    return { error: "Restaurant not found." };
  }

  let userId: string | null = null;
  let invitedFresh = false;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  // Invite email landing goes through our /auth/confirm route handler,
  // which calls verifyOtp server-side. This avoids email-scanner prefetches
  // consuming the one-shot token at Supabase's /auth/v1/verify endpoint
  // before the human can click. ?next= routes the user to password setup.
  const inviteRedirect = `${appUrl}/auth/confirm?next=/auth/invite`;

  // If this email already has an auth user but never signed in (still
  // pending invite), wipe the orphan and re-invite fresh so Supabase
  // sends a new email. Deleting the auth user cascades to app_users
  // (FK on user_id) — business_members was already removed if the admin
  // used the "Remove owner" UI.
  const existing = await findUserByEmail(email);
  if (existing && existing.lastSignInAt === null) {
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
      existing.id,
    );
    if (deleteError) {
      return {
        error: `Could not reset pending invite: ${deleteError.message}`,
      };
    }
  }

  const { data: invited, error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteRedirect,
    });

  if (invited?.user) {
    userId = invited.user.id;
    invitedFresh = true;
  } else if (inviteError) {
    // Existing user who HAS signed in before: just add the membership,
    // no re-invite email needed (they already have a working password).
    const code = (inviteError as { code?: string }).code ?? "";
    const msg = inviteError.message?.toLowerCase() ?? "";
    const alreadyExists =
      code === "email_exists" ||
      code === "user_already_exists" ||
      msg.includes("already") ||
      msg.includes("registered");

    if (!alreadyExists) {
      return { error: inviteError.message };
    }

    const refetch = await findUserByEmail(email);
    if (!refetch) {
      return {
        error:
          "User exists but could not be located. Ask them to sign in first, then retry.",
      };
    }
    userId = refetch.id;
  }

  if (!userId) {
    return { error: "Could not invite or locate that user." };
  }

  // Ensure app_users row exists for the invited user. Super-admins can
  // INSERT into app_users via RLS; service-role bypasses anyway.
  await supabaseAdmin
    .from("app_users")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });

  // Insert membership. Duplicate (business, user) silently no-ops.
  const { error: memberError } = await supabaseAdmin
    .from("business_members")
    .upsert(
      { business_id: businessId, user_id: userId, role_in_business: "owner" },
      { onConflict: "business_id,user_id", ignoreDuplicates: true },
    );
  if (memberError) {
    return { error: memberError.message };
  }

  await emitPlatformEvent(businessId, "owner_invited", {
    invited_email: email,
    invited_user_id: userId,
    inviter_user_id: session.userId,
    sent_email: invitedFresh,
  });

  revalidatePath(`/admin/restaurants/${businessId}/owners`);

  return {
    info: invitedFresh
      ? `Invite email sent to ${email}.`
      : `${email} already had an account — added without re-sending an email.`,
  };
}

export async function removeOwner(
  _prev: OwnerActionState,
  formData: FormData,
): Promise<OwnerActionState> {
  const session = await requireSuperAdmin();

  const parsed = removeSchema.safeParse({
    businessId: formData.get("businessId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const { businessId, userId } = parsed.data;

  const { error } = await supabaseAdmin
    .from("business_members")
    .delete()
    .eq("business_id", businessId)
    .eq("user_id", userId);

  if (error) {
    return { error: error.message };
  }

  await emitPlatformEvent(businessId, "owner_removed", {
    removed_user_id: userId,
    actor_user_id: session.userId,
  });

  revalidatePath(`/admin/restaurants/${businessId}/owners`);

  return { info: "Owner removed." };
}

export type OwnerMember = {
  userId: string;
  email: string | null;
  createdAt: string;
};

// listOwnersForBusiness: returns one row per member, joined with auth.users
// email. Service-role only — used by the admin owners page.
export async function listOwnersForBusiness(
  businessId: string,
): Promise<OwnerMember[]> {
  await requireSuperAdmin();

  const { data: members, error } = await supabaseAdmin
    .from("business_members")
    .select("user_id, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (error || !members) return [];

  const emails = new Map<string, string | null>();
  const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (usersPage) {
    for (const u of usersPage.users) {
      emails.set(u.id, u.email ?? null);
    }
  }

  return members.map((m) => ({
    userId: m.user_id as string,
    email: emails.get(m.user_id as string) ?? null,
    createdAt: m.created_at as string,
  }));
}
