import "server-only";

import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Append-only ledger of platform-significant actions. Lives in
// audit_log (migration 0012). Writes always go through service role —
// the table has no INSERT policy so a hijacked client key cannot
// forge entries.
//
// Audit writes must NEVER block a successful platform action. If the
// insert throws we swallow for UX but tell Sentry so a persistent
// failure surfaces.

export type AuditAction =
  | "owner_invited"
  | "owner_removed"
  | "business_created"
  | "business_updated"
  | "business_logo_updated"
  | "business_logo_cleared"
  | "campaign_created"
  | "subscription_created"
  | "subscription_updated"
  | "subscription_canceled"
  | "subscription_resumed"
  | "subscription_expired"
  | "subscription_paused"
  | "subscription_unpaused"
  | "subscription_payment_failed"
  | "subscription_payment_recovered"
  | "subscription_admin_override_set"
  | "subscription_admin_override_cleared";

export async function recordAudit(params: {
  actorUserId: string | null;
  businessId: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin.from("audit_log").insert({
      actor_user_id: params.actorUserId,
      business_id: params.businessId,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: "audit_log", action: params.action },
    });
  }
}
