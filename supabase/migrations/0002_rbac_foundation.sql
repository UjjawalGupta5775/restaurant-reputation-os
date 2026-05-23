-- Restaurant Reputation OS — RBAC foundation (Phase 4A, Step 1)
-- Additive only: introduces two new tables and two helper functions used by
-- the upcoming RLS swap (migration 0003). No changes to existing tables or
-- policies in this migration. Safe to apply at any time.
--
-- Tables introduced:
--   public.app_users        — one row per known auth user; platform flags
--   public.business_members — junction: which users have access to which
--                              businesses, in what role
--
-- Helper functions (used by 0003 RLS swap):
--   public.is_super_admin(uid)        — true if user has platform admin power
--   public.has_business_access(uid,b) — true if super-admin OR member of b
--
-- After this migration runs, run the backfill SQL (Step 2) to seed both
-- tables from existing data. RLS on existing tables is NOT changed here.
--
-- Ordering note: functions are created before any policy that references
-- them, so the policy's USING/WITH CHECK clauses resolve correctly at
-- creation time.

------------------------------------------------------------
-- 1. Tables (RLS enabled, no policies yet)
------------------------------------------------------------

create table public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.app_users enable row level security;

create type public.business_role as enum ('owner');

create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_in_business public.business_role not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_idx
  on public.business_members(user_id);
alter table public.business_members enable row level security;

------------------------------------------------------------
-- 2. Helper functions (must exist before any policy that uses them)
------------------------------------------------------------

-- is_super_admin: stable, security-definer so it can read app_users
-- regardless of the caller's RLS. Tiny body, no dynamic SQL, explicit
-- search_path to neutralise the standard SECURITY DEFINER gotcha.
create or replace function public.is_super_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_super_admin from public.app_users where user_id = uid),
    false
  );
$$;

-- has_business_access: super-admins see all; otherwise must be a member.
create or replace function public.has_business_access(uid uuid, bid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin(uid)
    or exists (
      select 1
      from public.business_members
      where business_id = bid
        and user_id = uid
    );
$$;

-- Lock function execution down. Postgres default is EXECUTE to PUBLIC for
-- new functions; revoke that and grant only to roles that actually call
-- these (anon/authenticated for RLS evaluation; service_role for code).
revoke all on function public.is_super_admin(uuid) from public;
revoke all on function public.has_business_access(uuid, uuid) from public;

grant execute on function public.is_super_admin(uuid)
  to anon, authenticated, service_role;
grant execute on function public.has_business_access(uuid, uuid)
  to anon, authenticated, service_role;

------------------------------------------------------------
-- 3. Policies on app_users
------------------------------------------------------------

-- A user can see their own row (so the client can render admin nav).
create policy "app_users self select"
  on public.app_users for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Only existing super-admins can read/write any row. Bootstrap is done via
-- the service role (Supabase SQL Editor / migration runner) which bypasses
-- RLS entirely, so the chicken-and-egg of "no super-admin yet" is fine.
create policy "app_users super-admin select"
  on public.app_users for select
  to authenticated
  using (public.is_super_admin((select auth.uid())));

create policy "app_users super-admin insert"
  on public.app_users for insert
  to authenticated
  with check (public.is_super_admin((select auth.uid())));

create policy "app_users super-admin update"
  on public.app_users for update
  to authenticated
  using (public.is_super_admin((select auth.uid())))
  with check (public.is_super_admin((select auth.uid())));

create policy "app_users super-admin delete"
  on public.app_users for delete
  to authenticated
  using (public.is_super_admin((select auth.uid())));

------------------------------------------------------------
-- 4. Policies on business_members
------------------------------------------------------------

-- A user can see their own membership rows.
create policy "business_members self select"
  on public.business_members for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Super-admins can read/write any membership.
create policy "business_members super-admin select"
  on public.business_members for select
  to authenticated
  using (public.is_super_admin((select auth.uid())));

create policy "business_members super-admin insert"
  on public.business_members for insert
  to authenticated
  with check (public.is_super_admin((select auth.uid())));

create policy "business_members super-admin update"
  on public.business_members for update
  to authenticated
  using (public.is_super_admin((select auth.uid())))
  with check (public.is_super_admin((select auth.uid())));

create policy "business_members super-admin delete"
  on public.business_members for delete
  to authenticated
  using (public.is_super_admin((select auth.uid())));
