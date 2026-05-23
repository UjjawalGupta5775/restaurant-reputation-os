import "server-only";
import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Public health probe for uptime monitors. Returns 200 when the app
// process is up AND can reach Postgres; 503 otherwise. Intentionally
// non-authenticated — uptime services can't hold secrets — and
// intentionally cheap (a count-with-head query touches indexes only).
//
// The response body is deliberately small and side-effect-free so this
// endpoint is safe to hit on a tight interval.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const { error } = await supabaseAdmin
      .from("businesses")
      .select("id", { count: "exact", head: true })
      .limit(1);
    if (error) {
      Sentry.captureMessage(`health: db error ${error.message}`, {
        level: "error",
        tags: { area: "health" },
      });
      return Response.json(
        { ok: false, db: "error", latencyMs: Date.now() - startedAt },
        { status: 503 },
      );
    }
    return Response.json({
      ok: true,
      db: "ok",
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "health" } });
    return Response.json(
      { ok: false, db: "threw", latencyMs: Date.now() - startedAt },
      { status: 503 },
    );
  }
}
