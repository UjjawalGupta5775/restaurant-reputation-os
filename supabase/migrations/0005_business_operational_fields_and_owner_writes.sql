-- Restaurant Reputation OS — owner write expansion + operational fields.
--
-- Two additive changes to support the owner-dashboard expansion pass:
--
--   1. New nullable columns on businesses: phone, address, hours.
--      These are owner-editable display/operational details. They are not
--      surfaced in the customer funnel /r/[slug] in this pass; the columns
--      simply give owners somewhere to record this information so it lives
--      on the restaurant record instead of in scattered notes.
--
--   2. Two new RLS policies that grant business members (i.e. restaurant
--      owners) write paths previously restricted to super-admins:
--        • businesses UPDATE — owners can update their restaurant row.
--          Field-level safety lives in the server action's Zod schema, not
--          in RLS. RLS only gates *which row* the owner can write.
--          Specifically owners must NOT be allowed to write slug,
--          google_place_id, or google_review_url — the server action enforces
--          this. Future contributors adding owner-callable update paths must
--          keep that whitelist tight.
--        • campaigns INSERT — owners can create campaigns within their
--          assigned businesses. No UPDATE/DELETE for owners — campaigns are
--          append-only operational artifacts; removing one would orphan
--          analytics rows.
--
-- Existing policies (super-admin INSERT/UPDATE/DELETE, member SELECT, anon
-- read-active, anon firehose insert) are untouched. This migration is
-- purely additive on top of 0003 + 0004.
--
-- Run order: 0001 → 0002 → 0002b → 0003 → 0004 → 0005 (this).

begin;

------------------------------------------------------------
-- 1. New operational columns on businesses.
------------------------------------------------------------

alter table public.businesses
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists hours text;

------------------------------------------------------------
-- 2. Owner write policies.
------------------------------------------------------------

-- Owners can UPDATE businesses they belong to. The server action limits
-- WHICH columns flow through; RLS limits WHICH rows.
create policy "businesses owner update"
  on public.businesses for update
  to authenticated
  using (public.has_business_access((select auth.uid()), id))
  with check (public.has_business_access((select auth.uid()), id));

-- Owners can INSERT campaigns into businesses they belong to.
create policy "campaigns owner insert"
  on public.campaigns for insert
  to authenticated
  with check (public.has_business_access((select auth.uid()), business_id));

commit;
