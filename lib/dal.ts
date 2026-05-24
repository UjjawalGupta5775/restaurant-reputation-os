import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const verifySession = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data) {
    redirect("/auth/login");
  }

  const { claims } = data;
  return {
    isAuth: true as const,
    userId: claims.sub as string,
    email: (claims.email as string | undefined) ?? null,
  };
});

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
});

export type SessionRole = {
  userId: string;
  email: string | null;
  isSuperAdmin: boolean;
  businessIds: string[];
};

// getSessionRole: verifies session, then reads platform role + business
// memberships for the current user. Uses RLS self-select policies so it
// works for any signed-in user without service-role escalation.
export const getSessionRole = cache(async (): Promise<SessionRole> => {
  const session = await verifySession();
  const supabase = await createClient();

  const [{ data: appUser }, { data: memberships }] = await Promise.all([
    supabase
      .from("app_users")
      .select("is_super_admin, deactivated_at")
      .eq("user_id", session.userId)
      .maybeSingle(),
    supabase
      .from("business_members")
      .select("business_id")
      .eq("user_id", session.userId),
  ]);

  // Bounce deactivated users immediately. Cookies can't be cleared from a
  // Server Component (Next.js disallows cookie writes outside actions and
  // route handlers), so we redirect through /auth/sign-out — a route
  // handler that actually clears the session before bouncing to the
  // login screen with the ?deactivated=1 notice. This closes the tab-
  // race window where a user deactivates in one tab and keeps using
  // another.
  if (appUser?.deactivated_at) {
    redirect("/auth/sign-out?reason=deactivated");
  }

  return {
    userId: session.userId,
    email: session.email,
    isSuperAdmin: appUser?.is_super_admin === true,
    businessIds: (memberships ?? []).map((r) => r.business_id as string),
  };
});

// requireSuperAdmin: gate for /admin/* surfaces and platform-wide actions.
// Redirects non-admins to /dashboard rather than throwing — keeps the URL
// unguessable but doesn't bounce the user to an error page.
export const requireSuperAdmin = cache(async (): Promise<SessionRole> => {
  const role = await getSessionRole();
  if (!role.isSuperAdmin) redirect("/dashboard");
  return role;
});

// requireBusinessAccess: gate for any per-business page or action. Super
// admins pass automatically; otherwise the user must be a member of the
// given business. Redirects to /dashboard on denial.
export const requireBusinessAccess = async (
  businessId: string,
): Promise<SessionRole> => {
  const role = await getSessionRole();
  if (role.isSuperAdmin) return role;
  if (!role.businessIds.includes(businessId)) redirect("/dashboard");
  return role;
};
