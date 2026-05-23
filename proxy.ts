import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
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
