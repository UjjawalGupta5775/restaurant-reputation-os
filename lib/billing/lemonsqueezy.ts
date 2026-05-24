// Lemon Squeezy adapter. Implements BillingProvider.
//
// Two outbound surfaces:
//   - POST /v1/checkouts   → create a unique checkout URL
//   - GET  /v1/subscriptions/{id} → fetch fresh signed portal URL
//
// One inbound surface:
//   - parseWebhookEvent: HMAC-SHA256 verified, mapped to BillingEvent.
//
// Status mapping (LS → ours):
//   on_trial    → trialing
//   active      → active
//   past_due    → past_due
//   unpaid      → past_due  (retries exhausted but not yet hard-expired)
//   paused      → past_due  (no billing happening; treat as recovery)
//   cancelled   → canceled  (cancel-at-period-end)
//   expired     → canceled  (hard end)
//
// Event-name mapping (LS uses British spelling; we normalize to US):
//   subscription_cancelled → subscription_canceled
//   subscription_paused, subscription_unpaused stay as-is

import { createHmac, timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import type {
  BillingEventKind,
  BillingProvider,
  CreateCheckoutInput,
  CreateCheckoutResult,
  GetPortalInput,
  GetPortalResult,
  ParsedWebhookEvent,
  VerifyWebhookInput,
} from "@/lib/billing/provider";
import type { SubscriptionStatus } from "@/lib/billing/state";

const LS_API_BASE = "https://api.lemonsqueezy.com/v1";
const PROVIDER_NAME = "lemonsqueezy";

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

function mapLemonStatus(raw: string): SubscriptionStatus {
  switch (raw) {
    case "on_trial":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "paused":
      return "past_due";
    case "cancelled":
    case "expired":
      return "canceled";
    default:
      // Unknown status — log and assume past_due so the owner sees a
      // warning banner rather than getting silently locked.
      Sentry.captureMessage(`Unknown LS subscription status: ${raw}`, {
        level: "warning",
        tags: { area: "billing", provider: PROVIDER_NAME },
      });
      return "past_due";
  }
}

function mapLemonEventName(raw: string): BillingEventKind | null {
  switch (raw) {
    case "subscription_created":
      return "subscription_created";
    case "subscription_updated":
      return "subscription_updated";
    case "subscription_cancelled":
      return "subscription_canceled";
    case "subscription_resumed":
      return "subscription_resumed";
    case "subscription_expired":
      return "subscription_expired";
    case "subscription_paused":
      return "subscription_paused";
    case "subscription_unpaused":
      return "subscription_unpaused";
    case "subscription_payment_success":
      return "subscription_payment_success";
    case "subscription_payment_failed":
      return "subscription_payment_failed";
    case "subscription_payment_recovered":
      return "subscription_payment_recovered";
    default:
      return null;
  }
}

// Events LS delivers when the dashboard webhook is subscribed broadly,
// but that have no application-level action in our state machine. The
// route still logs them to billing_webhook_events for forensics.
// Anything outside this set AND outside mapLemonEventName is treated
// as a parse error — that's how we'll notice if LS introduces a new
// event family we should handle.
const IGNORED_LS_EVENT_NAMES = new Set<string>([
  "order_created",
  "order_refunded",
  "customer_created",
  "customer_updated",
  "dispute_created",
  "dispute_resolved",
  "dispute_lost",
  "dispute_won",
  "affiliate_activated",
  "license_key_created",
  "license_key_updated",
  // subscription_payment_refunded: a refund on a single charge — we
  // don't track per-invoice state in V1. subscription_updated will
  // arrive separately if the underlying status changed.
  "subscription_payment_refunded",
  // subscription_plan_changed: variant change. V1 is single-variant,
  // and subscription_updated co-arrives with the new variant in
  // metadata anyway.
  "subscription_plan_changed",
]);

class LemonSqueezyProvider implements BillingProvider {
  readonly name = PROVIDER_NAME;

  isConfigured(): boolean {
    return Boolean(
      env("LEMONSQUEEZY_API_KEY") &&
        env("LEMONSQUEEZY_STORE_ID") &&
        env("LEMONSQUEEZY_VARIANT_ID") &&
        env("LEMONSQUEEZY_WEBHOOK_SECRET"),
    );
  }

  async createCheckoutUrl(
    input: CreateCheckoutInput,
  ): Promise<CreateCheckoutResult> {
    const apiKey = env("LEMONSQUEEZY_API_KEY");
    const storeId = env("LEMONSQUEEZY_STORE_ID");
    const variantId = env("LEMONSQUEEZY_VARIANT_ID");
    if (!apiKey || !storeId || !variantId) {
      throw new Error("LemonSqueezy is not configured: missing env vars");
    }

    const body = {
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: input.customerEmail ?? undefined,
            custom: {
              business_id: input.businessId,
              user_id: input.userId,
            },
          },
          product_options: {
            redirect_url: input.successRedirectUrl,
          },
        },
        relationships: {
          store: { data: { type: "stores", id: storeId } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    };

    const res = await fetch(`${LS_API_BASE}/checkouts`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`LS checkout create failed: ${res.status} ${text.slice(0, 500)}`);
    }

    const json: unknown = await res.json();
    const url = readPath(json, ["data", "attributes", "url"]);
    const id = readPath(json, ["data", "id"]);
    if (typeof url !== "string") {
      throw new Error("LS checkout response missing data.attributes.url");
    }
    return {
      url,
      providerCheckoutId: typeof id === "string" ? id : null,
    };
  }

  async getCustomerPortal(input: GetPortalInput): Promise<GetPortalResult> {
    const apiKey = env("LEMONSQUEEZY_API_KEY");
    if (!apiKey) throw new Error("LemonSqueezy is not configured: missing API key");

    const res = await fetch(
      `${LS_API_BASE}/subscriptions/${encodeURIComponent(input.providerSubscriptionId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/vnd.api+json",
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `LS subscription fetch failed: ${res.status} ${text.slice(0, 500)}`,
      );
    }

    const json: unknown = await res.json();
    const portal = readPath(json, ["data", "attributes", "urls", "customer_portal"]);
    const updatePayment = readPath(json, [
      "data",
      "attributes",
      "urls",
      "update_payment_method",
    ]);
    if (typeof portal !== "string") {
      throw new Error("LS subscription response missing urls.customer_portal");
    }
    return {
      customerPortalUrl: portal,
      updatePaymentMethodUrl: typeof updatePayment === "string" ? updatePayment : null,
    };
  }

  verifyWebhookSignature(input: VerifyWebhookInput): boolean {
    const secret = env("LEMONSQUEEZY_WEBHOOK_SECRET");
    if (!secret) return false;
    if (!input.signatureHeader) return false;

    // LS sends X-Signature as a hex-encoded HMAC-SHA256 of the raw body
    // using the signing secret.
    const expected = createHmac("sha256", secret)
      .update(input.rawBody, "utf8")
      .digest("hex");

    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(input.signatureHeader, "utf8");
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  parseWebhookEvent(rawBody: string): ParsedWebhookEvent {
    const payload = JSON.parse(rawBody) as unknown;

    const eventName = readPath(payload, ["meta", "event_name"]);
    if (typeof eventName !== "string") {
      throw new Error("LS webhook: missing meta.event_name");
    }

    // Object id and updated_at (or created_at) for synthesizing an
    // idempotency key. Both flat and JSON:API shapes are tolerated.
    const dataId =
      readPath(payload, ["data", "id"]) ?? readPath(payload, ["id"]);
    const attrs =
      readPath(payload, ["data", "attributes"]) ??
      readPath(payload, ["attributes"]);
    const stamp =
      (attrs && typeof attrs === "object"
        ? (attrs as Record<string, unknown>).updated_at ??
          (attrs as Record<string, unknown>).created_at
        : undefined) ?? new Date().toISOString();

    const kind = mapLemonEventName(eventName);
    if (!kind) {
      // Known-ignored: order/customer/dispute/affiliate/license/refund/
      // plan_change. Log it for forensics, return early.
      if (IGNORED_LS_EVENT_NAMES.has(eventName)) {
        return {
          ignored: true,
          provider: PROVIDER_NAME,
          providerEventId: `${eventName}:${typeof dataId === "string" ? dataId : "unknown"}:${typeof stamp === "string" ? stamp : "now"}`,
          eventName,
        };
      }
      // Truly unknown — likely a new LS event family. Bubble up.
      throw new Error(`LS webhook: unhandled event_name ${eventName}`);
    }

    if (typeof dataId !== "string") {
      throw new Error("LS webhook: missing subscription id");
    }
    if (!attrs || typeof attrs !== "object") {
      throw new Error("LS webhook: missing attributes");
    }
    const a = attrs as Record<string, unknown>;

    // subscription_payment_* events carry an invoice (LS type:
    // "subscription-invoices"), not a subscription:
    //   - data.id is the INVOICE id, not the subscription id
    //   - data.attributes.subscription_id is the real subscription id
    //   - data.attributes.status is "paid"/"failed"/"refunded" (the
    //     payment's status), NOT the subscription's status
    // The route handler knows not to write subscription fields for
    // these events — see buildUpdate(). status here is a sentinel
    // ("active") that the route will ignore.
    const isPaymentEvent =
      kind === "subscription_payment_success" ||
      kind === "subscription_payment_failed" ||
      kind === "subscription_payment_recovered";

    let subId: string;
    let rawStatus: string;
    if (isPaymentEvent) {
      const invoiceSubId = a.subscription_id;
      subId =
        typeof invoiceSubId === "number" || typeof invoiceSubId === "string"
          ? String(invoiceSubId)
          : dataId; // fall back to invoice id (worst case the route will Sentry-log "no row to update")
      rawStatus = typeof a.status === "string" ? a.status : "paid";
    } else {
      subId = dataId;
      rawStatus = typeof a.status === "string" ? a.status : "active";
    }
    const updatedAt =
      typeof a.updated_at === "string" ? a.updated_at : new Date().toISOString();

    const customData = readPath(payload, ["meta", "custom_data"]) as
      | Record<string, unknown>
      | undefined
      | null;

    const urls = (a.urls as Record<string, unknown> | undefined) ?? {};

    return {
      kind,
      provider: PROVIDER_NAME,
      // Synthetic idempotency key: stable for the same logical event
      // even if LS retries. Different state transitions get different
      // keys because updated_at changes on every server-side write.
      providerEventId: `${eventName}:${subId}:${updatedAt}`,
      providerCustomerId:
        typeof a.customer_id === "number" || typeof a.customer_id === "string"
          ? String(a.customer_id)
          : null,
      providerSubscriptionId: subId,
      // Payment events: status is a sentinel; the route handler will
      // not write the status column. Use "active" only so the type
      // stays a SubscriptionStatus.
      status: isPaymentEvent ? "active" : mapLemonStatus(rawStatus),
      providerStatus: rawStatus,
      trialEndsAt:
        !isPaymentEvent && typeof a.trial_ends_at === "string"
          ? a.trial_ends_at
          : null,
      currentPeriodEndsAt:
        !isPaymentEvent && typeof a.renews_at === "string" ? a.renews_at : null,
      cancelAt:
        !isPaymentEvent && a.cancelled === true && typeof a.ends_at === "string"
          ? a.ends_at
          : null,
      canceledAt:
        !isPaymentEvent && (rawStatus === "cancelled" || rawStatus === "expired")
          ? updatedAt
          : null,
      businessId:
        customData && typeof customData.business_id === "string"
          ? customData.business_id
          : null,
      userId:
        customData && typeof customData.user_id === "string"
          ? customData.user_id
          : null,
      snapshot: {
        customerPortalUrl:
          typeof urls.customer_portal === "string" ? urls.customer_portal : null,
        updatePaymentMethodUrl:
          typeof urls.update_payment_method === "string"
            ? urls.update_payment_method
            : null,
        cardBrand: typeof a.card_brand === "string" ? a.card_brand : null,
        cardLastFour:
          typeof a.card_last_four === "string" ? a.card_last_four : null,
        paymentProcessor:
          typeof a.payment_processor === "string" ? a.payment_processor : null,
      },
    };
  }
}

// Small helper to safely walk a JSON path without throwing on missing
// intermediates. Returns undefined on any miss.
function readPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

export const lemonSqueezyProvider: BillingProvider = new LemonSqueezyProvider();
