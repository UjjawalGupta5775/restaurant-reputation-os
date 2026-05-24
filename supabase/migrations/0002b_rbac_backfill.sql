-- Restaurant Reputation OS — RBAC backfill (Phase 4A, Step 2)
-- Run AFTER 0002_rbac_foundation.sql. Seeds the new tables from existing
-- data. Idempotent: safe to re-run (on conflict do nothing / explicit set).
--
-- This is a data migration, not schema. It does not alter any table or
-- policy. RLS on existing tables is still owner_user_id-based at this point.

------------------------------------------------------------
-- 1. Seed app_users from every existing auth user.
--    Everyone gets a row; no one is super-admin yet.
------------------------------------------------------------
insert into public.app_users (user_id)
  select id from auth.users
  on conflict (user_id) do nothing;

------------------------------------------------------------
-- 2. Mark the super-admin.
--    The UID below is the seeded demo super-admin for this project; flip
--    additional accounts via the /admin surface or by updating this row
--    directly in production.
------------------------------------------------------------
update public.app_users
  set is_super_admin = true
  where user_id = 'eb345ea9-babe-4c5d-885d-6dbdee4e9394';

------------------------------------------------------------
-- 3. Backfill business_members from businesses.owner_user_id.
--    Every existing business's owner becomes a member with role 'owner'.
------------------------------------------------------------
insert into public.business_members (business_id, user_id, role_in_business, created_at)
  select id, owner_user_id, 'owner', created_at
  from public.businesses
  where owner_user_id is not null
  on conflict (business_id, user_id) do nothing;
