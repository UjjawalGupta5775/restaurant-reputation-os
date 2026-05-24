import "server-only";

import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AccessReason } from "@/lib/billing/state";

// recordPausedView — server-side observability event for the
// "reviews paused" notice at /r/[slug]. Inserted with the service role
// because the caller is an anonymous (or session-less) RSC render path
// and we want the write to land even if the anon RLS policy ever
// tightens in the future. The customer experience never blocks on this
// write: the function is fire-and-forget and any failure is logged to
// Sentry, not surfaced.
//
// Why service role for what is "just an event"
// --------------------------------------------
// The anon "analytics_events insert" policy is permissive today, but
// the paused-view fires on a path where we already used the service-
// role client (getOperationalStatusPublic). Reusing it here keeps the
// same trust boundary and avoids round-tripping through the user
// cookie session for a read-then-write on the same surface.
//
// Session ID — by design random / disposable
// ------------------------------------------
// A paused view has no funnel session; the funnel never rendered. A
// fresh UUID per call satisfies the NOT NULL constraint on the column
// without giving the appearance that two paused-views belong to the
// same customer session.
export async function recordPausedView(params: {
  businessId: string;
  reason: AccessReason;
}): Promise<void> {
  try {
    await supabaseAdmin.from("analytics_events").insert({
      business_id: params.businessId,
      session_id: randomUUID(),
      event_type: "funnel_paused_view",
      metadata_json: {
        reason: params.reason,
      },
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: "analytics_insert", event: "funnel_paused_view" },
    });
  }
}
