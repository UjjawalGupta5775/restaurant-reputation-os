import "server-only";

import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/dal";
import {
  evaluateAccess,
  type AccessReason,
  type SubscriptionRecord,
  type SubscriptionStatus,
} from "@/lib/billing/state";

// Maps the DB row shape (snake_case, raw status string) into the
// canonical SubscriptionRecord used by the state machine. Centralizes
// the status narrowing so every caller gets a typed status.
function rowToRecord(r: Record<string, unknown>): SubscriptionRecord {
  return {
    id: r.id as string,
    businessId: r.business_id as string,
    provider: r.provider as string,
    providerCustomerId: (r.provider_customer_id as string | null) ?? null,
    providerSubscriptionId: (r.provider_subscription_id as string | null) ?? null,
    status: r.status as SubscriptionStatus,
    trialEndsAt: (r.trial_ends_at as string | null) ?? null,
    currentPeriodEndsAt: (r.current_period_ends_at as string | null) ?? null,
    graceUntil: (r.grace_until as string | null) ?? null,
    adminOverrideUntil: (r.admin_override_until as string | null) ?? null,
    cancelAt: (r.cancel_at as string | null) ?? null,
    canceledAt: (r.canceled_at as string | null) ?? null,
    metadata: (r.metadata as Record<string, unknown> | null) ?? {},
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// getSubscriptionForBusiness — used by owner-facing surfaces to read
// the current subscription state. Routes through the user's authed
// Supabase client so RLS enforces ownership.
//
// Callers should call requireBusinessAccess(businessId) BEFORE this if
// they want the access redirect; this function will still return null
// for a forbidden business because RLS will filter the row out.
export async function getSubscriptionForBusiness(
  businessId: string,
): Promise<SubscriptionRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id, business_id, provider, provider_customer_id, provider_subscription_id, status, trial_ends_at, current_period_ends_at, grace_until, admin_override_until, cancel_at, canceled_at, metadata, created_at, updated_at",
    )
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    Sentry.captureException(error, {
      tags: { area: "subscriptions", op: "getSubscriptionForBusiness" },
    });
    return null;
  }
  if (!data) return null;
  return rowToRecord(data as Record<string, unknown>);
}

// requireSubscriptionForBusiness — gate + read in one call. Used by
// pages that need the subscription record AND want to enforce business
// access (the common case for any /dashboard/restaurants/[id]/billing
// or banner surface).
export async function requireSubscriptionForBusiness(
  businessId: string,
): Promise<SubscriptionRecord | null> {
  await requireBusinessAccess(businessId);
  return getSubscriptionForBusiness(businessId);
}

// getSubscriptionByProviderSubId — service-role lookup used by the
// webhook handler to find an existing row by the provider's
// subscription ID (e.g. on subscription_updated where we don't have the
// business_id directly because custom_data wasn't threaded through).
export async function getSubscriptionByProviderSubId(
  provider: string,
  providerSubscriptionId: string,
): Promise<SubscriptionRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "id, business_id, provider, provider_customer_id, provider_subscription_id, status, trial_ends_at, current_period_ends_at, grace_until, admin_override_until, cancel_at, canceled_at, metadata, created_at, updated_at",
    )
    .eq("provider", provider)
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();

  if (error) {
    Sentry.captureException(error, {
      tags: { area: "subscriptions", op: "getSubscriptionByProviderSubId" },
    });
    return null;
  }
  if (!data) return null;
  return rowToRecord(data as Record<string, unknown>);
}

// getOperationalStatusPublic — used by the unauthenticated customer
// funnel at /r/[slug] to decide whether to render the funnel or a
// "reviews paused" screen. Routes through the service-role client
// because anon users have NO read access on subscriptions; only a
// boolean + a reason code crosses back out, never the row itself.
//
// Returns ok=false for businesses with no subscription row at all
// (matching evaluateAccess(null)). In practice that only happens for
// brand-new self-serve businesses before any LS event has fired — those
// businesses also can't create campaigns, so the customer never has a
// QR to scan for them anyway. Grandfathered businesses (pre-0013) have
// the long admin_override row and return ok=true.
export async function getOperationalStatusPublic(
  businessId: string,
): Promise<{ ok: boolean; reason: AccessReason }> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "id, business_id, provider, provider_customer_id, provider_subscription_id, status, trial_ends_at, current_period_ends_at, grace_until, admin_override_until, cancel_at, canceled_at, metadata, created_at, updated_at",
    )
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    Sentry.captureException(error, {
      tags: { area: "subscriptions", op: "getOperationalStatusPublic" },
    });
    // Fail OPEN on read errors. A transient Supabase blip should not
    // hide a paying restaurant's funnel from a customer at the table.
    // The owner-side gates remain strict; this surface biases toward
    // not punishing customers for our infrastructure problems.
    return { ok: true, reason: "active" };
  }

  const record = data ? rowToRecord(data as Record<string, unknown>) : null;
  const verdict = evaluateAccess(record);
  return { ok: verdict.ok, reason: verdict.reason };
}
