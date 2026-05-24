import { type NextRequest, type NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Baseline security headers applied to every proxied response. CSP is
// intentionally NOT here — adding one safely requires inventorying every
// script source (Sentry, fonts, embeds), so it's a separate follow-up.
function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return response;
}

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - api/qr (QR PNG endpoint, future Phase 1 — cached, no auth needed)
     * - common image extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|api/qr|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
