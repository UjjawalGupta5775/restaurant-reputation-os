-- Restaurant Reputation OS — RLS swap (Phase 4A, Step 8)
--
-- Swap owner-scoped RLS on businesses, campaigns, feedback_submissions,
-- and analytics_events from the legacy `owner_user_id = auth.uid()` model
-- to the new RBAC helpers from migration 0002:
--   public.is_super_admin(uid)
--   public.has_business_access(uid, business_id)
--
-- Semantics after this migration:
--   • Super-admin (app_users.is_super_admin = true):
--       full CRUD on businesses + campaigns; read on feedback + analytics.
--   • Restaurant owner (row in business_members for that business):
--       READ-ONLY on businesses, campaigns, feedback, analytics for the
--       businesses they belong to. No write paths.
--   • Anonymous (the public /r/[slug] funnel):
--       UNCHANGED. Can read businesses by slug, read active campaigns,
--       insert feedback_submissions, insert analytics_events.
--
-- Invariants preserved:
--   • Dual-path-always-visible: anon read of businesses + active campaigns,
--     anon insert on feedback + analytics remain intact.
--   • The owner_user_id column is NOT dropped here (Step 10 drops it
--     after a verification window). It just stops being load-bearing for
--     RLS as of this commit.
--
-- Run order: 0001 → 0002 → 0002b (backfill) → 0003 (this).
-- Atomic: single transaction. If any policy fails to create, the entire
-- swap rolls back and the legacy policies stay in effect.

begin;

------------------------------------------------------------
-- businesses
------------------------------------------------------------

-- Drop legacy owner-scoped policies. The anon-read-by-slug policy stays.
drop policy if exists "businesses owner select" on public.businesses;
drop policy if exists "businesses owner insert" on public.businesses;
drop policy if exists "businesses owner update" on public.businesses;
drop policy if exists "businesses owner delete" on public.businesses;

-- Members + super-admins can read their businesses.
create policy "businesses member select"
  on public.businesses for select
  to authenticated
  using (public.has_business_access((select auth.uid()), id));

-- Writes are super-admin-only. DAL also enforces this in server actions
-- (defense in depth); RLS is the authoritative gate.
create policy "businesses super-admin insert"
  on public.businesses for insert
  to authenticated
  with check (public.is_super_admin((select auth.uid())));

create policy "businesses super-admin update"
  on public.businesses for update
  to authenticated
  using (public.is_super_admin((select auth.uid())))
  with check (public.is_super_admin((select auth.uid())));

create policy "businesses super-admin delete"
  on public.businesses for delete
  to authenticated
  using (public.is_super_admin((select auth.uid())));

------------------------------------------------------------
-- campaigns
------------------------------------------------------------

-- Drop the single combined owner_all policy; recreate split by command.
-- Anon read-active stays.
drop policy if exists "campaigns owner all" on public.campaigns;

create policy "campaigns member select"
  on public.campaigns for select
  to authenticated
  using (public.has_business_access((select auth.uid()), business_id));

create policy "campaigns super-admin insert"
  on public.campaigns for insert
  to authenticated
  with check (public.is_super_admin((select auth.uid())));

create policy "campaigns super-admin update"
  on public.campaigns for update
  to authenticated
  using (public.is_super_admin((select auth.uid())))
  with check (public.is_super_admin((select auth.uid())));

create policy "campaigns super-admin delete"
  on public.campaigns for delete
  to authenticated
  using (public.is_super_admin((select auth.uid())));

------------------------------------------------------------
-- feedback_submissions
------------------------------------------------------------

-- Anon insert (firehose) stays untouched. Swap the owner-read policy.
drop policy if exists "feedback owner select" on public.feedback_submissions;

create policy "feedback member select"
  on public.feedback_submissions for select
  to authenticated
  using (public.has_business_access((select auth.uid()), business_id));

------------------------------------------------------------
-- analytics_events
------------------------------------------------------------

-- Anon insert (firehose) stays untouched. Swap the owner-read policy.
drop policy if exists "analytics owner select" on public.analytics_events;

create policy "analytics member select"
  on public.analytics_events for select
  to authenticated
  using (public.has_business_access((select auth.uid()), business_id));

commit;
