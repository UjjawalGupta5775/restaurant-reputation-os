-- Migration 0011 — self-serve owner signup.
--
-- Up to now, owners only existed because a super-admin invited them and
-- attached them to a business via business_members. The product needs to
-- accept self-serve signups: anyone can register, and on signup they get
-- their first restaurant created and their own membership row attached.
--
-- The clean way to do this is a SECURITY DEFINER RPC. We deliberately do
-- NOT relax businesses.INSERT RLS to "any authenticated user" — that
-- would let an authenticated owner create arbitrary businesses without
-- attaching themselves, polluting the slug namespace and orphaning rows.
-- The RPC is the only owner-side write path and it always creates the
-- membership in the same transaction as the business.
--
-- Idempotency notes:
--   - app_users insert uses ON CONFLICT DO NOTHING so an existing
--     super-admin who calls this for some reason does not get downgraded.
--   - The slug-collision loop tries the base slug then base-2, base-3,
--     ... up to 25 attempts before giving up.

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

  return v_business_id;
end;
$$;

revoke all on function public.create_owner_business(text, text) from public;
revoke all on function public.create_owner_business(text, text) from anon;
grant execute on function public.create_owner_business(text, text)
  to authenticated;
