-- 0014: account self-service soft-delete.
--
-- Owners can deactivate themselves from /dashboard/settings/account. The
-- effect is non-destructive: the auth.users row stays, business_members
-- links stay, restaurants stay. We mark app_users.deactivated_at; the DAL
-- (verifySession) bounces any deactivated user to the login page with a
-- ?deactivated=1 notice.
--
-- Reactivation is super-admin-only: clearing this column in SQL restores
-- the account. No self-serve reactivation in v1 — keeps the door closed
-- after the user pulls it shut.

alter table public.app_users
  add column deactivated_at timestamptz;

-- Partial index — most rows have deactivated_at = null, indexing only the
-- deactivated minority keeps it tiny. The DAL lookup is by user_id (already
-- the primary key), so this index isn't used for the hot path; it exists for
-- admin queries like "list all deactivated owners".
create index app_users_deactivated_at_idx on public.app_users (deactivated_at)
  where deactivated_at is not null;

-- No RLS policy changes. Self-select on app_users already exists; the
-- column is added under that policy. UPDATE on this column is privileged
-- and goes through the service-role client in lib/actions/account.ts —
-- never grant authenticated UPDATE on it, or owners could clear their
-- own deactivation by hitting the REST endpoint directly.
