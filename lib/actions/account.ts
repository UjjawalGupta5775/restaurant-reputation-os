"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifySession } from "@/lib/dal";
import type { AuthState } from "@/lib/actions/auth";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters."),
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    path: ["newPassword"],
    message: "Pick a password you haven't used before.",
  });

const changeEmailSchema = z.object({
  email: z.email("Enter a valid email."),
});

const deactivateSchema = z.object({
  confirmEmail: z.string().trim().min(1, "Type your email to confirm."),
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

// changePassword — Supabase has no "verify current password" RPC, so we
// re-authenticate with the supplied current password before updating.
// signInWithPassword on an already-signed-in user rotates the session
// silently (no logout), so this is safe.
export async function changePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const session = await verifySession();
  if (!session.email) {
    return { error: "Your account email is missing. Contact support." };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: session.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError) {
    return {
      fieldErrors: { currentPassword: ["Current password is incorrect."] },
    };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (updateError) {
    return { error: updateError.message };
  }

  return { info: "Password updated." };
}

// changeEmail — Supabase requires confirmation links to BOTH old and new
// addresses before the change takes effect. We surface that in the UI copy;
// this action just kicks off the flow.
export async function changeEmail(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  await verifySession();

  const parsed = changeEmailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: parsed.data.email });
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings/account");
  return {
    info: "Confirmation links sent. Click the link in BOTH your current and new email inboxes to finalize the change.",
  };
}

// cancelPendingEmailChange — Supabase has no first-class "cancel" API; the
// pending change auto-expires when the OTP TTL runs out (default 1 hour) or
// the user clicks neither link. We clear it explicitly via admin update so
// the user can retry without waiting. Token rows are wiped by setting
// email_change_token_new/current to '' alongside email.
export async function cancelPendingEmailChange(): Promise<AuthState> {
  const session = await verifySession();

  if (!session.email) {
    return { error: "No current email on file. Contact support." };
  }

  // Re-asserting the same email clears new_email + tokens server-side.
  const { error } = await supabaseAdmin.auth.admin.updateUserById(session.userId, {
    email: session.email,
    email_confirm: true,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings/account");
  return { info: "Pending change cancelled." };
}

// deactivateAccount — soft delete. Marks app_users.deactivated_at, signs the
// user out, lands them on /auth/login?deactivated=1. The DAL bounces any
// future request from this user back to the login screen.
//
// Routes through the service-role client because writing your own
// deactivated_at value is privileged: if we granted owner UPDATE on this
// column, a malicious script could un-deactivate via direct REST. The server
// action is the auth gate (verifySession first).
export async function deactivateAccount(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const session = await verifySession();

  const parsed = deactivateSchema.safeParse({
    confirmEmail: formData.get("confirmEmail"),
  });
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error) };
  }

  // Case-insensitive compare — the user might type "Me@Example.com" while
  // their stored email is lowercase. Trim both sides defensively.
  const typed = parsed.data.confirmEmail.trim().toLowerCase();
  const actual = (session.email ?? "").trim().toLowerCase();
  if (!actual || typed !== actual) {
    return {
      fieldErrors: {
        confirmEmail: ["That doesn't match your account email."],
      },
    };
  }

  const { error } = await supabaseAdmin
    .from("app_users")
    .update({ deactivated_at: new Date().toISOString() })
    .eq("user_id", session.userId);

  if (error) {
    return { error: "Could not deactivate your account. Try again." };
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login?deactivated=1");
}
