"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baseSlugFor } from "@/lib/slug";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const signupSchema = z.object({
  email: z.email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  restaurantName: z
    .string()
    .trim()
    .min(1, "Restaurant name is required.")
    .max(120, "Restaurant name must be 120 characters or fewer."),
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

  // Deactivation gate. signInWithPassword only checks auth.users — a
  // deactivated owner still has a valid auth.users row, so we have to
  // re-check public.app_users.deactivated_at after the session lands.
  // Doing this here (in a server action) means signOut() actually clears
  // the cookies; the equivalent check in the DAL runs from a Server
  // Component and silently no-ops on the cookie write, producing a
  // login → /dashboard → /auth/login redirect loop.
  const { data: claimsData } = await supabase.auth.getClaims();
  const newUserId = claimsData?.claims?.sub as string | undefined;
  if (newUserId) {
    const { data: appUser } = await supabase
      .from("app_users")
      .select("deactivated_at")
      .eq("user_id", newUserId)
      .maybeSingle();
    if (appUser?.deactivated_at) {
      await supabase.auth.signOut();
      redirect("/auth/login?deactivated=1");
    }
  }

  redirect(await landingPathForCurrentUser());
}

// Self-serve owner signup. Creates the auth user and (if Supabase confirm is
// disabled and the session is returned immediately) provisions the first
// restaurant in the same call via the create_owner_business RPC. If email
// confirmation is enabled, the action returns an info message; the user
// will create their restaurant from /dashboard once they confirm + sign in.
export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    restaurantName: formData.get("restaurantName"),
  });
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // If "Confirm email" is enabled in Supabase Auth settings, the
      // confirmation link in the email will land here and POST through
      // /auth/confirm (the interstitial that survives email scanners).
      // If confirm is disabled, options.emailRedirectTo is ignored and
      // the user is signed in immediately below.
      emailRedirectTo: `${await origin()}/auth/confirm?type=signup&next=/dashboard`,
    },
  });
  if (signUpError) {
    return { error: signUpError.message };
  }

  // No session means Supabase requires the user to confirm their email
  // before signing in. We can't call the RPC without auth.uid(), so we
  // stop here — they'll set up their restaurant from /dashboard later.
  if (!signUpData.session) {
    return {
      info: "Almost done — check your email to confirm. Sign in afterwards and you'll be guided through creating your restaurant.",
    };
  }

  const slugBase = baseSlugFor(parsed.data.restaurantName);
  const { data: businessId, error: rpcError } = await supabase.rpc(
    "create_owner_business",
    { p_name: parsed.data.restaurantName, p_slug_base: slugBase },
  );
  if (rpcError || !businessId) {
    // The auth user exists but the restaurant wasn't created. Surface the
    // failure so the user can try again from /dashboard (where the
    // empty-state form runs the same RPC).
    return {
      error:
        "Your account was created but we couldn't set up your restaurant. Sign in and finish from your dashboard.",
    };
  }

  redirect(`/dashboard/restaurants/${businessId}`);
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
