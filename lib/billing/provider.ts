// Provider-agnostic billing abstraction.
//
// Every concrete provider (LemonSqueezy in V1; potentially Stripe/Paddle
// later) implements this interface. The application code — server
// actions, webhook handler, query layer — only ever depends on this
// interface, never on a concrete provider's SDK shape.
//
// Swapping providers should be exactly: write a new adapter, change
// the factory in lib/billing/index.ts. No other files change.
//
// Three boundaries are crossed via this interface:
//
//   1. Outbound: create a checkout URL, fetch a customer portal URL.
//      Adapter calls the provider's REST API.
//
//   2. Inbound: verify webhook signatures, parse webhook payloads into
//      a normalized BillingEvent. Adapter is responsible for HMAC and
//      for mapping the provider's status/event vocabulary to ours.
//
//   3. Identity: every parsed event carries businessId + userId from
//      the checkout's custom_data passthrough. The webhook handler
//      uses those to locate the right subscription row.

import type { SubscriptionStatus } from "@/lib/billing/state";

// What the adapter needs to create a checkout. The application
// supplies these — the provider doesn't know about businesses.
export type CreateCheckoutInput = {
  businessId: string;
  userId: string;
  // Optional email pre-fill. Skipped if null.
  customerEmail?: string | null;
  // Where to send the customer after a successful purchase. Required —
  // we never want the default LS confirmation modal to leak in prod.
  successRedirectUrl: string;
};

export type CreateCheckoutResult = {
  url: string;
  // The provider's checkout/session ID. Stored for debugging; not
  // needed for the subscription lifecycle.
  providerCheckoutId: string | null;
};

// What the adapter needs to fetch a fresh customer portal URL. The
// URL is signed and short-lived (LS expires it in 24h), so we re-fetch
// on every "Manage billing" click rather than persisting.
export type GetPortalInput = {
  providerSubscriptionId: string;
};

export type GetPortalResult = {
  customerPortalUrl: string;
  updatePaymentMethodUrl: string | null;
};

// Webhook verification: pass the raw body bytes (the JSON-parsed
// object loses signature fidelity) and the signature header. Returns
// true only on a constant-time HMAC match.
export type VerifyWebhookInput = {
  rawBody: string;
  signatureHeader: string | null;
};

// Normalized event shape — every provider's event is mapped into one
// of these. The webhook handler dispatches on `kind`.
export type BillingEventKind =
  | "subscription_created"
  | "subscription_updated"
  | "subscription_canceled"
  | "subscription_resumed"
  | "subscription_expired"
  | "subscription_paused"
  | "subscription_unpaused"
  | "subscription_payment_success"
  | "subscription_payment_failed"
  | "subscription_payment_recovered";

export type BillingEvent = {
  // Used by the dispatcher.
  kind: BillingEventKind;

  // Provider namespace (e.g. "lemonsqueezy"). Mirrors the DB column.
  provider: string;

  // Synthetic ID used for idempotency. LS doesn't emit a per-delivery
  // UUID, so the adapter constructs one from event_name + sub_id +
  // updated_at. Whatever shape this takes, it must be stable across
  // retries of the same logical event.
  providerEventId: string;

  // The provider's customer + subscription IDs. customerId may be null
  // on early events; subscriptionId is always present for subscription_*.
  providerCustomerId: string | null;
  providerSubscriptionId: string;

  // Mapped status — already in our internal vocabulary.
  status: SubscriptionStatus;
  // Raw status string from the provider, preserved for the metadata
  // snapshot. Useful for forensics ("did this come in as paused or
  // unpaid?").
  providerStatus: string;

  // Time boundaries the application cares about.
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null; // LS: renews_at
  cancelAt: string | null;             // LS: ends_at when cancelled=true
  canceledAt: string | null;           // LS: server timestamp on cancel

  // Identity passthrough from checkout custom_data. Either of these
  // may be missing if a checkout was created outside our flow (LS
  // dashboard, etc.) — the webhook handler must tolerate that and log
  // for forensics rather than throwing.
  businessId: string | null;
  userId: string | null;

  // Snapshot fields the app might display later. Stored in the row's
  // metadata jsonb.
  snapshot: {
    customerPortalUrl: string | null;
    updatePaymentMethodUrl: string | null;
    cardBrand: string | null;
    cardLastFour: string | null;
    paymentProcessor: string | null;
  };
};

// An event LS delivers because we subscribed to a broad event set in
// the dashboard, but that we have no application-level action for
// (orders, customers, disputes, affiliates, license keys, plan
// changes, refunds). The webhook route records these in
// billing_webhook_events for forensics and returns 200 — no Sentry
// exception, no state change.
export type IgnoredBillingEvent = {
  ignored: true;
  provider: string;
  // Synthetic, stable across LS retries of the same logical event so
  // the (provider, provider_event_id) unique index still dedupes.
  providerEventId: string;
  // The raw LS event_name (e.g. "order_created") — used as event_type
  // when we insert the forensics row.
  eventName: string;
};

export type ParsedWebhookEvent = BillingEvent | IgnoredBillingEvent;

export interface BillingProvider {
  // Identifier used to populate the `provider` column.
  readonly name: string;

  // True when the adapter has every env var it needs to operate.
  // Application code uses this to decide whether to surface billing UI
  // at all in environments where the keys aren't configured.
  isConfigured(): boolean;

  // Outbound
  createCheckoutUrl(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  getCustomerPortal(input: GetPortalInput): Promise<GetPortalResult>;

  // Inbound
  verifyWebhookSignature(input: VerifyWebhookInput): boolean;
  // Parse a verified payload. Returns:
  //   - BillingEvent for events that drive state changes (subscription_*)
  //   - IgnoredBillingEvent for events the provider sends because the
  //     dashboard webhook is configured broadly, but that the
  //     application has no action for (orders, customers, disputes,
  //     etc.). The route still logs these for forensics.
  // Throws on truly unknown event names (signal of an LS schema change
  // we need to handle) or malformed payloads — the route catches that
  // and writes a row with `error` set.
  parseWebhookEvent(rawBody: string): ParsedWebhookEvent;
}
