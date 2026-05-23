import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Stub for future magic-link / OAuth flows. Exchanges a `code` query param
// for a session, then redirects to `next` (default /dashboard).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${url.origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${url.origin}/auth/login?error=auth_callback_failed`,
  );
}
