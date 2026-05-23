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
  // /auth/callback, /auth/invite, and /auth/reset-password) get bounced to
  // /dashboard. The recovery flow leaves a session behind on its way to the
  // reset form, so reset-password has to be reachable while authenticated.
  // The dashboard layout / admin layout decides where signed-in users
  // actually belong.
  if (
    claims &&
    isAuthRoute &&
    !path.startsWith("/auth/callback") &&
    !path.startsWith("/auth/invite") &&
    !path.startsWith("/auth/reset-password")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
