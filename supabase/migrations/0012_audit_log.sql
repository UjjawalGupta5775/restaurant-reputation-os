-- Migration 0012 — audit log for sensitive actions.
--
-- A narrow append-only ledger of platform-significant events. Distinct
-- from analytics_events (funnel/usage) — this one tracks who changed
-- what about businesses, owners, and campaigns. Useful for:
--   - incident forensics ("who deleted that owner row?")
--   - support ("when did the slug change?")
--   - future compliance asks.
--
-- Write path: SERVER ONLY via the service role, through
-- lib/audit.ts#recordAudit. No client-side INSERT policy is granted, so
-- a hijacked anon/authenticated key cannot forge entries.
--
-- Read path:
--   - super-admin: read all
--   - business owner: read own-business rows (RLS via has_business_access)
--
-- Indexes are chosen for the two queries we expect:
--   - "show me everything that happened to this business, newest first"
--   - "show me everything an actor did, newest first"
--   - "show me all of action X, newest first" (compliance / monitoring)

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  -- actor: who did the action. Null when system-triggered (cron) or when
  -- the actor was deleted afterwards (ON DELETE SET NULL).
  actor_user_id uuid references auth.users(id) on delete set null,
  -- business this action affected, if any. Null for platform-wide
  -- actions. ON DELETE SET NULL so deleting a business does not also
  -- erase its history.
  business_id uuid references public.businesses(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_business_idx
  on public.audit_log(business_id, created_at desc);
create index audit_log_actor_idx
  on public.audit_log(actor_user_id, created_at desc);
create index audit_log_action_idx
  on public.audit_log(action, created_at desc);

alter table public.audit_log enable row level security;

-- Super-admins see everything.
create policy "audit_log super-admin select"
  on public.audit_log for select
  to authenticated
  using (public.is_super_admin((select auth.uid())));

-- Owners see entries for their own businesses. has_business_access
-- already short-circuits true for super-admins, but we keep both
-- policies explicit so the intent is readable from psql.
create policy "audit_log owner select"
  on public.audit_log for select
  to authenticated
  using (
    business_id is not null
    and public.has_business_access((select auth.uid()), business_id)
  );

-- No INSERT/UPDATE/DELETE policies. Service role bypasses RLS and is
-- the only writer; client-side roles cannot mutate this table. Updates
-- are not expected — the ledger is append-only by convention.
