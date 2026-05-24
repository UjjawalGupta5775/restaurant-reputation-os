import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not insert any code between createServerClient and getClaims —
  // session refresh depends on it running first.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/auth/");
  const isProtected = path.startsWith("/dashboard") || path.startsWith("/admin");

  if (!claims && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Already-signed-in users hitting /auth/login (or any /auth/* other than
  // the listed exceptions) get bounced to /dashboard.
  //   - /auth/callback, /auth/invite, /auth/reset-password — recovery /
  //     invite flows that legitimately run with a session attached.
  //   - /auth/confirm — verifyOtp may be called for a still-signed-in user
  //     (e.g. tapping the email link from a different tab after signup).
  //   - /auth/sign-out — the whole point is to clear the session; bouncing
  //     to /dashboard before the route handler runs would defeat it and
  //     produce a redirect loop when the DAL re-bounces deactivated users.
  if (
    claims &&
    isAuthRoute &&
    !path.startsWith("/auth/callback") &&
    !path.startsWith("/auth/invite") &&
    !path.startsWith("/auth/reset-password") &&
    !path.startsWith("/auth/confirm") &&
    !path.startsWith("/auth/sign-out")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
