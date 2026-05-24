-- Migration 0016 — provision a trial subscription on self-serve signup.
--
-- Bug we're fixing
-- ----------------
-- Migration 0011 created the create_owner_business RPC, which inserts a
-- business + business_members row in one transaction. Migration 0013
-- added the subscriptions table and grandfathered every business that
-- existed AT THAT TIME with a 5-year admin_override row, so the platform
-- ships banner-free for the existing tenant set.
--
-- What 0013 did NOT do: hook a fresh subscriptions row into the
-- create_owner_business code path. Every owner who self-serve-signs-up
-- AFTER 0013 lands with no subscriptions row at all. evaluateAccess(null)
-- in lib/billing/state.ts treats that as no_subscription → ok = false,
-- which means hasOperationalAccess() short-circuits to false on the very
-- first request. The downstream effects:
--   • checkOperationalSubscription (lib/billing/guard.ts) blocks every
--     gated mutation — createCampaign, review chip edits, response
--     template edits — for brand-new owners who never had a chance to
--     subscribe.
--   • getOperationalStatusPublic returns ok = false → /r/[slug] shows
--     the "reviews paused" notice for a restaurant whose owner literally
--     just signed up.
--
-- Fix
-- ---
-- Extend create_owner_business to also INSERT INTO subscriptions with a
-- fresh trial window. The status stays at the default 'trialing' and
-- trial_ends_at is set to now() + 14 days, matching the default in
-- lib/billing/trial.ts (BILLING_TRIAL_DAYS = 14). evaluateAccess walks
-- the trial branch and reports ok = true for the duration.
--
-- Why the trial length is hard-coded in SQL
-- -----------------------------------------
-- The actual trial value will eventually be overwritten by the
-- subscription_created Lemon Squeezy webhook with whatever LS variant
-- config dictates. The 14-day default only governs the gap between
-- signup and first checkout. Pulling the value from an env var would
-- require a separate application-side step (defeating the atomicity
-- of the RPC), and the value barely changes — it lives next to the
-- TS default so they stay aligned.
--
-- Idempotency / safety
-- --------------------
-- The function is REPLACE'd in place (same signature, same grants).
-- Existing businesses are untouched — the grandfather backfill in 0013
-- already covered them. Only NEW calls to create_owner_business get the
-- new subscription insert.
--
-- Run order: 0001 → … → 0015 → 0016 (this).

begin;

create or replace function public.create_owner_business(
  p_name text,
  p_slug_base text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_business_id uuid;
  v_slug text;
  v_attempt int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_name is null
     or length(trim(p_name)) = 0
     or length(p_name) > 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if p_slug_base is null or length(trim(p_slug_base)) = 0 then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;

  -- Ensure the caller has an app_users row. Idempotent — never overwrites
  -- an existing super-admin flag.
  insert into public.app_users (user_id, is_super_admin)
  values (v_uid, false)
  on conflict (user_id) do nothing;

  loop
    if v_attempt = 0 then
      v_slug := p_slug_base;
    else
      v_slug := p_slug_base || '-' || (v_attempt + 1);
    end if;

    begin
      insert into public.businesses (name, slug)
      values (trim(p_name), v_slug)
      returning id into v_business_id;
      exit;
    exception
      when unique_violation then
        v_attempt := v_attempt + 1;
        if v_attempt >= 25 then
          raise exception 'slug_exhausted' using errcode = '23505';
        end if;
    end;
  end loop;

  insert into public.business_members (business_id, user_id, role_in_business)
  values (v_business_id, v_uid, 'owner');

  -- New: provision a trialing subscription. ON CONFLICT DO NOTHING is
  -- defensive — the unique index on (business_id) guarantees one row,
  -- and this insert runs immediately after the business insert so a
  -- conflict here would be impossible under normal control flow. Kept
  -- to keep the migration safe to re-run in any conceivable scenario.
  insert into public.subscriptions (
    business_id,
    provider,
    status,
    trial_ends_at,
    metadata
  )
  values (
    v_business_id,
    'lemonsqueezy',
    'trialing',
    now() + interval '14 days',
    jsonb_build_object(
      'origin', 'self_serve_signup',
      'note', 'Auto-provisioned trial on create_owner_business (migration 0016)'
    )
  )
  on conflict (business_id) do nothing;

  return v_business_id;
end;
$$;

-- Re-affirm grants (a CREATE OR REPLACE keeps them, but stating it
-- defensively keeps the RPC's permission surface explicit at the site
-- where the function is defined).
revoke all on function public.create_owner_business(text, text) from public;
revoke all on function public.create_owner_business(text, text) from anon;
grant execute on function public.create_owner_business(text, text)
  to authenticated;

commit;
