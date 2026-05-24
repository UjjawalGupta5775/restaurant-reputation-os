// Billing webhook receiver. Verifies the HMAC signature on every
// incoming request, persists the raw payload for forensics, dedupes
// retries via the (provider, provider_event_id) unique index, and
// dispatches to the upsert handler.
//
// Operational rules:
//   - We ALWAYS return 200 once we have a verified signature, even if
//     downstream processing fails. The error is recorded on the
//     billing_webhook_events row so we can replay manually. Returning
//     non-200 would cause LS to retry up to 3 more times, which makes
//     debugging worse, not better.
//   - 401 on a missing/bad signature — LS will retry and eventually
//     give up, which is the correct behavior for a misconfigured
//     secret.
//   - 400 on malformed body — same retry semantics.
//   - The route runs on the nodejs runtime, not edge, because we
//     depend on node:crypto and the supabase service-role client.

import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordAudit, type AuditAction } from "@/lib/audit";
import { getBillingProvider } from "@/lib/billing";
import { newPastDueGraceUntil, newCancelGraceUntil } from "@/lib/billing/trial";
import { notifyOwnerOfBillingEvent } from "@/lib/billing/notify";
import type { BillingEvent, ParsedWebhookEvent } from "@/lib/billing/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Maps our internal BillingEvent.kind to an AuditAction.
// Some events (subscription_payment_success) we deliberately do NOT
// audit — they fire on every renewal and would drown the audit log.
function auditActionFor(kind: BillingEvent["kind"]): AuditAction | null {
  switch (kind) {
    case "subscription_created":
      return "subscription_created";
    case "subscription_updated":
      // Heavy traffic — only audited on status transitions, handled below.
      return null;
    case "subscription_canceled":
      return "subscription_canceled";
    case "subscription_resumed":
      return "subscription_resumed";
    case "subscription_expired":
      return "subscription_expired";
    case "subscription_paused":
      return "subscription_paused";
    case "subscription_unpaused":
      return "subscription_unpaused";
    case "subscription_payment_failed":
      return "subscription_payment_failed";
    case "subscription_payment_recovered":
      return "subscription_payment_recovered";
    case "subscription_payment_success":
      return null;
  }
}

// Computes the row update for an incoming event. The update is an
// upsert by business_id when known, or by (provider, provider_subscription_id)
// when business_id is missing (e.g. checkout created outside our flow).
function buildUpdate(event: BillingEvent) {
  // subscription_payment_* events carry an invoice payload, not a
  // subscription — their attributes.status is the payment status
  // ("paid"/"failed"/"refunded"), NOT the subscription status. Writing
  // event.status onto the subscriptions row from those events would
  // corrupt it (we saw exactly that: trialing got pushed to past_due
  // by a successful payment). The adapter sets event.status to a
  // sentinel for payment events; here we make doubly sure by not
  // writing any subscription-owned column for those events. The
  // subscription's actual state always comes through
  // subscription_created/updated/paused/etc., which fire alongside.
  const isPaymentEvent =
    event.kind === "subscription_payment_success" ||
    event.kind === "subscription_payment_failed" ||
    event.kind === "subscription_payment_recovered";

  let graceUntil: string | null | undefined = undefined;
  if (event.kind === "subscription_payment_failed") {
    graceUntil = newPastDueGraceUntil();
  } else if (
    event.kind === "subscription_payment_success" ||
    event.kind === "subscription_payment_recovered"
  ) {
    graceUntil = null;
  } else if (event.kind === "subscription_canceled") {
    graceUntil = event.cancelAt ?? newCancelGraceUntil();
  } else if (
    event.kind === "subscription_resumed" ||
    event.kind === "subscription_unpaused"
  ) {
    graceUntil = null;
  } else if (event.kind === "subscription_expired") {
    graceUntil = null;
  } else if (event.status === "past_due" && event.kind !== "subscription_updated") {
    // Covers subscription_paused (LS maps to past_due) without
    // double-firing on the noisy subscription_updated stream.
    graceUntil = newPastDueGraceUntil();
  }

  const update: Record<string, unknown> = {
    provider: event.provider,
    provider_customer_id: event.providerCustomerId,
    metadata: {
      provider_status: event.providerStatus,
      last_event: event.kind,
      last_event_at: new Date().toISOString(),
      ...event.snapshot,
    },
  };

  if (!isPaymentEvent) {
    update.provider_subscription_id = event.providerSubscriptionId;
    update.status = event.status;
    update.trial_ends_at = event.trialEndsAt;
    update.current_period_ends_at = event.currentPeriodEndsAt;
    update.cancel_at = event.cancelAt;
    update.canceled_at = event.canceledAt;
  }

  if (graceUntil !== undefined) {
    update.grace_until = graceUntil;
  }
  return update;
}

// Locate the subscription row to update. Preference order:
//   1. event.businessId  (came through custom_data — authoritative)
//   2. existing row keyed on (provider, providerSubscriptionId)
//
// Returns null if neither match — the webhook handler then writes an
// orphan log line and processes nothing. Possible causes: a checkout
// was created in the LS dashboard without custom_data, OR the
// business_id in custom_data points at a deleted row.
async function locateSubscriptionRow(
  event: BillingEvent,
): Promise<{ id: string; businessId: string } | null> {
  if (event.businessId) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("id, business_id")
      .eq("business_id", event.businessId)
      .maybeSingle();
    if (data) return { id: data.id as string, businessId: data.business_id as string };
  }
  if (event.providerSubscriptionId) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("id, business_id")
      .eq("provider", event.provider)
      .eq("provider_subscription_id", event.providerSubscriptionId)
      .maybeSingle();
    if (data) return { id: data.id as string, businessId: data.business_id as string };
  }
  return null;
}

async function applyEvent(event: BillingEvent): Promise<{
  businessId: string | null;
  statusBefore: string | null;
  statusAfter: string;
}> {
  const update = buildUpdate(event);

  // subscription_created with a business_id from custom_data: this is
  // the first time we've seen this provider sub. The grandfather row
  // (if any) for that business already exists from migration 0013, so
  // we update it in place. We clear the admin_override_until on first
  // real subscription so the normal state machine takes over.
  if (event.kind === "subscription_created" && event.businessId) {
    const { data: before } = await supabaseAdmin
      .from("subscriptions")
      .select("status")
      .eq("business_id", event.businessId)
      .maybeSingle();

    update.admin_override_until = null;

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          business_id: event.businessId,
          ...update,
        },
        { onConflict: "business_id" },
      );
    if (error) throw error;

    return {
      businessId: event.businessId,
      statusBefore: (before?.status as string | null) ?? null,
      statusAfter: event.status,
    };
  }

  // Other events: locate the row, then update.
  const located = await locateSubscriptionRow(event);
  if (!located) {
    Sentry.captureMessage("Billing webhook: no subscription row to update", {
      level: "warning",
      tags: { area: "billing", event_kind: event.kind },
      extra: {
        providerSubscriptionId: event.providerSubscriptionId,
        businessId: event.businessId,
      },
    });
    return { businessId: null, statusBefore: null, statusAfter: event.status };
  }

  const { data: before } = await supabaseAdmin
    .from("subscriptions")
    .select("status")
    .eq("id", located.id)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update(update)
    .eq("id", located.id);
  if (error) throw error;

  return {
    businessId: located.businessId,
    statusBefore: (before?.status as string | null) ?? null,
    statusAfter: event.status,
  };
}

export async function POST(req: Request): Promise<Response> {
  // Capture the raw body up-front — once parsed, signature fidelity is
  // lost. Limit to 1MB to defend against accidental floods.
  const rawBody = await req.text();
  if (rawBody.length > 1024 * 1024) {
    return new Response("Payload too large", { status: 413 });
  }

  const provider = getBillingProvider();
  const signatureHeader = req.headers.get("x-signature");

  const signatureValid = provider.verifyWebhookSignature({
    rawBody,
    signatureHeader,
  });

  if (!signatureValid) {
    // Persist for forensics — useful to spot replay attempts and
    // misconfigured secrets. Best-effort; failures here are non-fatal.
    try {
      await supabaseAdmin.from("billing_webhook_events").insert({
        provider: provider.name,
        // Synthesize an ID since we don't trust the body content yet.
        provider_event_id: `unsigned:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        event_type: "unverified",
        signature_valid: false,
        error: "signature mismatch",
        payload: tryParseJson(rawBody) ?? { raw_truncated: rawBody.slice(0, 2000) },
      });
    } catch (err) {
      Sentry.captureException(err, { tags: { area: "billing_webhook" } });
    }
    return new Response("Invalid signature", { status: 401 });
  }

  // Signature verified — every code path from here returns 200 so LS
  // doesn't retry. Failures are recorded on the row and replayed manually.

  let parsed: ParsedWebhookEvent;
  try {
    parsed = provider.parseWebhookEvent(rawBody);
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "billing_webhook", phase: "parse" } });
    try {
      await supabaseAdmin.from("billing_webhook_events").insert({
        provider: provider.name,
        provider_event_id: `parse_error:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        event_type: "parse_error",
        signature_valid: true,
        error: err instanceof Error ? err.message : String(err),
        payload: tryParseJson(rawBody) ?? { raw_truncated: rawBody.slice(0, 2000) },
      });
    } catch (insertErr) {
      Sentry.captureException(insertErr, { tags: { area: "billing_webhook" } });
    }
    return new Response("OK", { status: 200 });
  }

  // Ignored events (orders, customers, disputes, affiliates, license
  // keys, plan changes, refunds) are still logged for forensics so we
  // can confirm LS deliveries land here, but we don't dispatch them
  // through the state machine and we don't audit them. Return 200.
  if ("ignored" in parsed) {
    const { error: ignoredInsertErr } = await supabaseAdmin
      .from("billing_webhook_events")
      .insert({
        provider: parsed.provider,
        provider_event_id: parsed.providerEventId,
        event_type: parsed.eventName,
        signature_valid: true,
        processed_at: new Date().toISOString(),
        payload: tryParseJson(rawBody) ?? {},
      });
    // 23505 = duplicate LS retry of the same logical event — fine.
    if (ignoredInsertErr && ignoredInsertErr.code !== "23505") {
      Sentry.captureException(ignoredInsertErr, {
        tags: { area: "billing_webhook", phase: "insert_ignored" },
      });
    }
    return new Response("OK (ignored)", { status: 200 });
  }

  const event: BillingEvent = parsed;

  // Idempotency: try to insert the event row first. A unique-violation
  // (23505) means we've already processed this exact (provider,
  // provider_event_id), so skip the upsert entirely.
  const { error: insertErr } = await supabaseAdmin
    .from("billing_webhook_events")
    .insert({
      provider: event.provider,
      provider_event_id: event.providerEventId,
      event_type: event.kind,
      signature_valid: true,
      payload: tryParseJson(rawBody) ?? {},
    });

  if (insertErr && insertErr.code === "23505") {
    // Already processed — return 200, do nothing else.
    return new Response("OK (duplicate)", { status: 200 });
  }

  if (insertErr) {
    Sentry.captureException(insertErr, {
      tags: { area: "billing_webhook", phase: "insert_event" },
    });
    // Fall through and try to process anyway — the event row is for
    // forensics, not for correctness.
  }

  try {
    const { businessId, statusBefore, statusAfter } = await applyEvent(event);

    // Mark the event row processed.
    await supabaseAdmin
      .from("billing_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", event.provider)
      .eq("provider_event_id", event.providerEventId);

    // Audit log: most events get one entry. subscription_updated only
    // audits if the status actually transitioned, to avoid drowning the log.
    const action = auditActionFor(event.kind);
    const shouldAudit =
      action != null ||
      (event.kind === "subscription_updated" && statusBefore !== statusAfter);

    if (shouldAudit) {
      await recordAudit({
        actorUserId: null, // system event — no human actor
        businessId,
        action: (action ?? "subscription_updated") as AuditAction,
        targetType: "subscription",
        targetId: event.providerSubscriptionId,
        metadata: {
          provider: event.provider,
          provider_status: event.providerStatus,
          internal_status_before: statusBefore,
          internal_status_after: statusAfter,
          event_kind: event.kind,
        },
      });
    }

    // Owner notification: fire-and-forget. The notifier internally
    // gates per kind (no email on every renewal), looks up the signup
    // user's email (custom_data.userId, falling back to first
    // business_members row), and no-ops when RESEND_API_KEY is unset.
    // Idempotency comes from the 23505 short-circuit above — duplicate
    // LS deliveries never reach this branch.
    notifyOwnerOfBillingEvent(event, businessId).catch((err) => {
      Sentry.captureException(err, {
        tags: { area: "billing_webhook", phase: "notify" },
        extra: { event_kind: event.kind },
      });
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: "billing_webhook", phase: "apply" },
      extra: { event_kind: event.kind, provider_sub: event.providerSubscriptionId },
    });
    await supabaseAdmin
      .from("billing_webhook_events")
      .update({ error: err instanceof Error ? err.message : String(err) })
      .eq("provider", event.provider)
      .eq("provider_event_id", event.providerEventId);
  }

  return new Response("OK", { status: 200 });
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
