-- Migration 0009 — email digest preferences + send log.
--
-- Phase 4B (post-MVP retention): give owners a weekly summary of their
-- restaurants' activity. Two new tables, no changes to existing tables.
--
-- notification_preferences:
--   One row per auth user. weekly_digest_enabled gates whether the cron
--   sends them anything. unsubscribe_token is a long random hex string
--   used for one-click unsubscribe (no auth required — token IS the auth).
--
-- digest_log:
--   Audit trail of attempted sends. error column is non-null on failure.
--   Used to (a) avoid double-sends if cron fires twice and (b) surface
--   delivery problems to admins.

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly_digest_enabled boolean not null default true,
  unsubscribe_token text not null default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Token must be unique so an unsubscribe link maps to exactly one user.
create unique index notification_preferences_unsub_token_idx
  on public.notification_preferences(unsubscribe_token);

alter table public.notification_preferences enable row level security;

-- Owners can read/update their own prefs row. They can also INSERT it if
-- the backfill missed them (e.g., user created after this migration ran).
create policy "notification_preferences self select"
  on public.notification_preferences for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "notification_preferences self insert"
  on public.notification_preferences for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "notification_preferences self update"
  on public.notification_preferences for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Super-admins can read all prefs (for debugging delivery issues).
create policy "notification_preferences super-admin select"
  on public.notification_preferences for select
  to authenticated
  using (public.is_super_admin((select auth.uid())));

------------------------------------------------------------
-- Digest log
------------------------------------------------------------

create table public.digest_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  restaurants_count int not null default 0,
  error text
);
create index digest_log_user_sent_idx
  on public.digest_log(user_id, sent_at desc);

alter table public.digest_log enable row level security;

-- Owners see their own send history.
create policy "digest_log self select"
  on public.digest_log for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Super-admins see everything (for debugging).
create policy "digest_log super-admin select"
  on public.digest_log for select
  to authenticated
  using (public.is_super_admin((select auth.uid())));

-- Writes come from the cron route, which uses the service role and bypasses
-- RLS. No INSERT policy needed for authenticated.

------------------------------------------------------------
-- One-shot unsubscribe RPC.
-- The unsubscribe page calls this with the token alone — no auth required,
-- which means the regular RLS policies (self_update) wouldn't match. A
-- SECURITY DEFINER function does the lookup + update atomically and is the
-- only path anon has into this table.
------------------------------------------------------------

create or replace function public.unsubscribe_by_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  update public.notification_preferences
     set weekly_digest_enabled = false,
         updated_at = now()
   where unsubscribe_token = p_token
   returning user_id into v_user_id;
  return v_user_id is not null;
end;
$$;

revoke all on function public.unsubscribe_by_token(text) from public;
grant execute on function public.unsubscribe_by_token(text) to anon, authenticated;

------------------------------------------------------------
-- Backfill: insert default prefs for every existing auth user so the
-- weekly cron has someone to send to from day one. ON CONFLICT keeps this
-- migration re-runnable.
------------------------------------------------------------

insert into public.notification_preferences (user_id)
  select id from auth.users
on conflict (user_id) do nothing;
