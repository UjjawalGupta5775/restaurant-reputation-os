-- Restaurant Reputation OS — drop legacy owner_user_id (Phase 4A, Step 10)
--
-- After migration 0003 swapped RLS to the business_members/app_users
-- model, the businesses.owner_user_id column is no longer referenced by
-- any policy or query. Drop it together with its index.
--
-- The application code that previously inserted owner_user_id on create
-- (lib/actions/businesses.ts) was updated in the same change.
--
-- Index `businesses_owner_idx` is dropped automatically when the column
-- is dropped (PostgreSQL cascades index removal). Stating it explicitly
-- here for the audit trail.

begin;

drop index if exists public.businesses_owner_idx;

alter table public.businesses drop column if exists owner_user_id;

commit;
