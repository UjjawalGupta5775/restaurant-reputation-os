"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const passwordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const emailSchema = z.object({
  email: z.email("Enter a valid email."),
});

export type AuthState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[]>;
      info?: string;
    }
  | undefined;

function collectFieldErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string") continue;
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

// Where the caller lands after successful authentication. Super-admins go
// to the platform-wide /admin surface; everyone else lands on /dashboard.
// Read directly via the user-scoped client (uses the self-select RLS on
// app_users — no service-role escalation here).
async function landingPathForCurrentUser(): Promise<string> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;
  if (!userId) return "/dashboard";

  const { data } = await supabase
    .from("app_users")
    .select("is_super_admin")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.is_super_admin ? "/admin" : "/dashboard";
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: error.message };
  }

  redirect(await landingPathForCurrentUser());
}

// setInvitePassword: invited users land on /auth/invite already signed in
// (the callback exchanged their invite code for a session). They set their
// password here, then get redirected to their role-appropriate home.
export async function setInvitePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    return { error: "Your invite link has expired. Ask your admin to re-send." };
  }

  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error) };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { error: error.message };
  }

  redirect(await landingPathForCurrentUser());
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}

// Build the origin (scheme + host) from request headers. Used to construct
// the redirectTo URL for password-reset emails — Supabase needs an absolute
// URL.
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Request a password reset email. Always reports the same success message
// to avoid leaking which addresses have accounts. The actual email is only
// sent if Supabase recognises the address.
export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const redirectTo = `${await origin()}/auth/confirm?next=/auth/reset-password`;
  // We intentionally do not branch on the response — a 4xx (e.g. rate limit
  // or unknown address) still surfaces the same neutral message.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
  return {
    info: "If an account exists for that email, a reset link is on its way.",
  };
}

// Set a new password after the recovery OTP has been verified by
// /auth/confirm. The verify step established a session, so we only need
// to validate the new password and call updateUser.
export async function resetPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    return {
      error: "Your reset link has expired. Request a new one from the sign-in page.",
    };
  }

  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error) };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { error: error.message };
  }

  redirect(await landingPathForCurrentUser());
}
