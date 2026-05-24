import "server-only";

import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BillingEvent } from "@/lib/billing/provider";
import {
  renderBillingEmail,
  shouldEmailForKind,
  type RenderedBillingEmail,
} from "@/lib/billing/emails";

// Owner notification dispatcher for billing webhook events.
//
// Why we send our own email even though Lemon Squeezy already sends a
// receipt: the LS receipt goes to whatever email the customer typed at
// checkout, which may differ from the signup email on Reputation OS
// (real case we saw: signup as wenalah136@ameady.com, billing email is
// the store owner's personal LS account). The signup user owns the
// dashboard; they need the operational signal ("payment failed", "we
// resumed your sub") regardless of which inbox got the LS receipt.
//
// Operational rules:
//   - Fire-and-forget from the webhook. We never block the 200 response
//     on email delivery; failures are reported to Sentry and the
//     webhook still succeeds.
//   - No-op when RESEND_API_KEY isn't set — same pattern as the digest
//     cron, so this can ship before email credentials are configured.
//   - Per-event-kind gating lives in lib/billing/emails.ts (e.g. we
//     don't email on every successful renewal). This module just routes.
//   - Idempotency comes free from the webhook handler's 23505 short-
//     circuit: a duplicate LS delivery returns 200 BEFORE applyEvent,
//     so this function never runs twice for the same provider_event_id.

type SendResult = { ok: true; id: string } | { ok: false; reason: string };

async function findRecipientEmail(
  event: BillingEvent,
  fallbackBusinessId: string | null,
): Promise<string | null> {
  // Preference: the user_id passthrough from checkout custom_data.
  // That's the signup user — the one we want to notify even if their
  // LS billing email differs.
  if (event.userId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(
      event.userId,
    );
    if (!error && data?.user?.email) return data.user.email;
  }

  // Fallback: first business_members row for this business. Covers
  // checkouts created outside our flow (LS dashboard, support recovery)
  // where userId never made it into custom_data.
  if (fallbackBusinessId) {
    const { data: member } = await supabaseAdmin
      .from("business_members")
      .select("user_id")
      .eq("business_id", fallbackBusinessId)
      .limit(1)
      .maybeSingle();
    const userId = member?.user_id as string | undefined;
    if (userId) {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (data?.user?.email) return data.user.email;
    }
  }

  return null;
}

async function findBusinessName(businessId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .maybeSingle();
  return (data?.name as string | null) ?? null;
}

function resolveAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
    .trim()
    .replace(/\/+$/, "");
}

function resolveFromAddress(): string {
  return (
    process.env.BILLING_FROM_EMAIL ??
    process.env.DIGEST_FROM_EMAIL ??
    "Reputation OS <onboarding@resend.dev>"
  );
}

async function sendViaResend(params: {
  to: string;
  from: string;
  email: RenderedBillingEmail;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY not set (skipped)" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: params.from,
        to: params.to,
        subject: params.email.subject,
        html: params.email.html,
        text: params.email.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const reason = `Resend ${res.status}: ${body.slice(0, 200)}`;
      Sentry.captureMessage(reason, {
        level: "error",
        tags: { area: "billing_notify", status: String(res.status) },
      });
      return { ok: false, reason };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id ?? "unknown" };
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "billing_notify" } });
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "unknown send error",
    };
  }
}

// Dispatch a billing email for the given event. Returns a structured
// result so callers can log, but never throws — the webhook must
// remain successful even when notification fails.
export async function notifyOwnerOfBillingEvent(
  event: BillingEvent,
  resolvedBusinessId: string | null,
): Promise<SendResult> {
  if (!shouldEmailForKind(event.kind)) {
    return { ok: false, reason: `no email for kind ${event.kind}` };
  }

  try {
    const businessId = event.businessId ?? resolvedBusinessId;
    if (!businessId) {
      return { ok: false, reason: "no business_id resolved" };
    }

    const [to, businessName] = await Promise.all([
      findRecipientEmail(event, businessId),
      findBusinessName(businessId),
    ]);

    if (!to) return { ok: false, reason: "no recipient email found" };
    if (!businessName) return { ok: false, reason: "no business name found" };

    const rendered = renderBillingEmail({
      kind: event.kind,
      businessName,
      trialEndsAt: event.trialEndsAt,
      currentPeriodEndsAt: event.currentPeriodEndsAt,
      cancelAt: event.cancelAt,
      appUrl: resolveAppUrl(),
      businessId,
    });
    if (!rendered) return { ok: false, reason: "render returned null" };

    return sendViaResend({ to, from: resolveFromAddress(), email: rendered });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: "billing_notify", event_kind: event.kind },
    });
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "unknown notify error",
    };
  }
}
