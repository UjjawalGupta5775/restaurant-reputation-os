-- Migration 0013 — billing subscriptions + webhook idempotency.
--
-- Introduces per-restaurant subscription state and a ledger of incoming
-- provider webhooks. Designed to be provider-agnostic — the `provider`
-- column lets us swap Lemon Squeezy for Stripe/Paddle later without a
-- schema change. Lemon Squeezy is the only provider wired up in V1.
--
-- Operational philosophy (carried in from billing-lemonsqueezy.md):
--   • The customer funnel /r/[slug] is NEVER billing-gated. Public anon
--     SELECTs on businesses/campaigns/feedback continue to work
--     regardless of subscription state. No policy here touches those
--     tables.
--   • V1 enforcement is "banner-only" — the application code reads
--     subscription state but does not hard-lock owner surfaces until
--     BILLING_ENFORCEMENT_ENABLED flips. The schema supports both.
--   • admin_override_until is a separate override layer, not a status
--     value. A row in any status — including canceled — is treated as
--     operational while admin_override_until is in the future.
--   • Grandfather backfill: every existing business gets a 5-year
--     admin_override so live tenants are never surprised by a banner.
--
-- Write path: SERVICE ROLE ONLY for both tables. No INSERT/UPDATE/DELETE
-- policies are granted, so a compromised anon/authenticated key cannot
-- forge or mutate subscription state. The webhook handler runs server
-- side and is the sole writer.
--
-- Read path:
--   subscriptions:
--     - super-admin: read all
--     - business owner: read own-business rows (via has_business_access)
--   billing_webhook_events:
--     - super-admin only (raw provider payloads — owners don't see these)
--
-- Run order: 0001 → … → 0012 → 0013 (this).

begin;

------------------------------------------------------------
-- 1. subscriptions — per-business billing state.
------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),

  -- One subscription per business. Enforced by the unique constraint
  -- below. If a business cancels and re-subscribes, we update the
  -- existing row rather than creating a new one — keeps the relation
  -- simple and means the webhook handler can upsert by business_id.
  business_id uuid not null references public.businesses(id) on delete cascade,

  -- Provider namespace. 'lemonsqueezy' for V1; the column lets a future
  -- adapter coexist (e.g. mid-migration). Combined with
  -- provider_subscription_id this gives us a globally unique handle.
  provider text not null default 'lemonsqueezy',

  -- Provider's customer + subscription IDs. Null until the first
  -- successful checkout-completed webhook lands.
  provider_customer_id text,
  provider_subscription_id text,

  -- High-level state machine. The application reads `status` together
  -- with `admin_override_until`, `grace_until`, and the period end
  -- timestamps to compute hasOperationalAccess(). Don't add new statuses
  -- without updating lib/billing/state.ts in the same pass.
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled')),

  -- When the trial window ends. Null when no trial was granted (e.g.
  -- direct paid signup). Application treats trial_ends_at > now() as
  -- access regardless of status.
  trial_ends_at timestamptz,

  -- End of the current paid period. Updated on each subscription_updated
  -- webhook. Used for banner messaging ("renews on …") and as the
  -- fallback access boundary if grace_until is null.
  current_period_ends_at timestamptz,

  -- Recovery window after past_due / canceled. Lets the owner keep
  -- working while we wait on retry attempts or before the soft-lock
  -- takes effect. Application: status in (past_due, canceled) AND
  -- now() < grace_until ⇒ still operational.
  grace_until timestamptz,

  -- Super-admin override layer. When set in the future, the business is
  -- treated as operational regardless of status. Used for: grandfather
  -- backfill, manual extensions, comped accounts, support recovery.
  -- The audit log records every flip — see lib/audit.ts.
  admin_override_until timestamptz,

  -- Cancel-at-period-end timestamp from the provider. Owner clicked
  -- "cancel" but still has access until current_period_ends_at. We
  -- store this separately from canceled_at so the UI can distinguish
  -- "cancellation scheduled" from "cancellation took effect".
  cancel_at timestamptz,

  -- Actual cancellation timestamp. Set when status moves to canceled.
  canceled_at timestamptz,

  -- Raw provider state snapshot from the most recent webhook. Useful
  -- for debugging and audits without re-fetching from the provider API.
  -- Owners can read this — keep payloads scrubbed of sensitive fields
  -- (the webhook handler is responsible for selecting what lands here).
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One subscription row per business. Re-subscribes update in place.
create unique index subscriptions_business_uniq on public.subscriptions(business_id);

-- Webhook upserts and admin views need a fast lookup by provider's
-- subscription ID. Partial unique — multiple nulls allowed for rows
-- still in the pre-checkout trial.
create unique index subscriptions_provider_sub_uniq
  on public.subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;

create index subscriptions_status_idx on public.subscriptions(status);
create index subscriptions_grace_idx on public.subscriptions(grace_until)
  where grace_until is not null;

-- updated_at maintenance — bumped by the application on every write
-- via the lib/billing layer, but also enforced at the DB level so a
-- direct SQL fix-up doesn't leave a stale value.
create or replace function public.subscriptions_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.subscriptions_set_updated_at();

alter table public.subscriptions enable row level security;

-- Super-admins see every subscription.
create policy "subscriptions super-admin select"
  on public.subscriptions for select
  to authenticated
  using (public.is_super_admin((select auth.uid())));

-- Owners see subscriptions for businesses they belong to. Mirrors the
-- audit_log pattern from 0012 — has_business_access short-circuits true
-- for super-admins, but we keep both policies explicit.
create policy "subscriptions owner select"
  on public.subscriptions for select
  to authenticated
  using (public.has_business_access((select auth.uid()), business_id));

-- No INSERT/UPDATE/DELETE policies. Service role bypasses RLS and is
-- the only writer. Hijacked client keys cannot mutate billing state.

------------------------------------------------------------
-- 2. billing_webhook_events — idempotency + audit ledger.
------------------------------------------------------------

create table public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),

  -- Same provider namespace as subscriptions.
  provider text not null,

  -- Provider's event ID. Lemon Squeezy emits `id` on every event;
  -- combined with `provider`, this is our idempotency key.
  provider_event_id text not null,

  event_type text not null,

  -- Did the HMAC check pass? Rows with signature_valid = false land
  -- here too — the handler logs them, returns 401 to the provider, and
  -- moves on. Keeping the row lets us spot replay attempts.
  signature_valid boolean not null,

  received_at timestamptz not null default now(),

  -- Set after the handler has successfully applied state changes.
  -- Null = received but not yet processed (or processing failed).
  processed_at timestamptz,

  -- Error message if processing failed after signature passed. Lets
  -- support replay events that errored without re-running successful
  -- side effects.
  error text,

  -- Raw payload — used for replay and forensic debugging. Owners do
  -- NOT see this table; only super-admins.
  payload jsonb not null default '{}'::jsonb
);

-- Idempotency: a single (provider, provider_event_id) pair can only be
-- stored once. The webhook handler relies on this — it INSERTs first
-- and treats unique_violation (23505) as "already processed, return 200".
create unique index billing_webhook_events_idempotency
  on public.billing_webhook_events(provider, provider_event_id);

create index billing_webhook_events_received_idx
  on public.billing_webhook_events(received_at desc);
create index billing_webhook_events_unprocessed_idx
  on public.billing_webhook_events(received_at desc)
  where processed_at is null;

alter table public.billing_webhook_events enable row level security;

-- Super-admins only — raw payloads can include provider-side metadata
-- that we don't want to expose to owners.
create policy "billing_webhook_events super-admin select"
  on public.billing_webhook_events for select
  to authenticated
  using (public.is_super_admin((select auth.uid())));

-- No INSERT/UPDATE/DELETE policies. Service-role only.

------------------------------------------------------------
-- 3. Grandfather backfill.
------------------------------------------------------------
--
-- Every existing business gets a placeholder subscription row with a
-- 5-year admin_override. This ensures:
--   • Owners do not see a sudden "your subscription is inactive"
--     banner the moment the billing code ships.
--   • hasOperationalAccess() returns true for every existing business
--     without special-casing "no subscription row".
--   • The status stays at the default 'trialing' so we don't
--     accidentally claim grandfathered tenants paid — once the override
--     window passes, the normal billing flow takes over.
--
-- New businesses (created after this migration) will get their first
-- subscription row via the owner_self_serve signup path or via the
-- super-admin "create restaurant" flow. Those rows are inserted with
-- a fresh 14-day trial, not a 5-year override.

insert into public.subscriptions (business_id, provider, status, admin_override_until, metadata)
select
  b.id,
  'lemonsqueezy',
  'trialing',
  now() + interval '5 years',
  jsonb_build_object(
    'backfill', true,
    'note', 'Grandfathered at migration 0013 — operational via admin_override'
  )
from public.businesses b
where not exists (
  select 1 from public.subscriptions s where s.business_id = b.id
);

commit;
