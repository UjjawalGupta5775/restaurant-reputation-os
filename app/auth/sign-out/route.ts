import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Force-logout route. The DAL needs a way to terminate a session and
// redirect — but DAL runs inside Server Components, where cookie writes
// silently fail. Route Handlers CAN set cookies, so signOut() actually
// clears the session here. Any place that wants to bounce a user with
// the session torn down should redirect to this URL rather than calling
// signOut() inline.
//
// Query params:
//   reason=deactivated  →  bounce to /auth/login?deactivated=1
//   (anything else)      →  bounce to /auth/login
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const reason = request.nextUrl.searchParams.get("reason");
  const target = reason === "deactivated"
    ? "/auth/login?deactivated=1"
    : "/auth/login";

  return NextResponse.redirect(new URL(target, request.url));
}
