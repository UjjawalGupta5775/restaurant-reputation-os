"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const passwordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters."),
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
