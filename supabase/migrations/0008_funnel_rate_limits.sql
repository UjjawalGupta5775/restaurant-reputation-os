-- Migration 0008 — funnel rate limiting.
--
-- The customer flow at /r/[slug] exposes two anon write paths: feedback
-- submissions and analytics events. Without a rate limiter, a script can
-- flood either table, inflate Supabase row-write quota, poison analytics,
-- or spam an owner's feedback inbox.
--
-- Design: fixed-window counter keyed on (bucket, ip_hash). A SECURITY
-- DEFINER function does the atomic check so anon never gets direct table
-- privileges. ON CONFLICT keeps the check to one round-trip.

create table public.funnel_rate_limits (
  key text primary key,
  window_started_at timestamptz not null default now(),
  count int not null default 0
);

create index funnel_rate_limits_window_idx
  on public.funnel_rate_limits(window_started_at);

alter table public.funnel_rate_limits enable row level security;

-- No SELECT/INSERT/UPDATE policies for anon or authenticated. All access
-- is mediated by the SECURITY DEFINER function below.

create or replace function public.check_funnel_rate_limit(
  p_key text,
  p_max int,
  p_window_seconds int
) returns table(allowed boolean, retry_after_seconds int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_started_at timestamptz;
  v_count int;
  v_now timestamptz := now();
begin
  insert into public.funnel_rate_limits as f (key, window_started_at, count)
    values (p_key, v_now, 1)
  on conflict (key) do update
    set
      window_started_at = case
        when v_now - f.window_started_at >= make_interval(secs => p_window_seconds)
          then v_now
        else f.window_started_at
      end,
      count = case
        when v_now - f.window_started_at >= make_interval(secs => p_window_seconds)
          then 1
        else f.count + 1
      end
  returning f.window_started_at, f.count
    into v_window_started_at, v_count;

  if v_count <= p_max then
    return query select true, 0;
  else
    return query select
      false,
      greatest(
        1,
        ceil(
          extract(epoch from (v_window_started_at + make_interval(secs => p_window_seconds) - v_now))
        )::int
      );
  end if;
end;
$$;

revoke all on function public.check_funnel_rate_limit(text, int, int) from public;
grant execute on function public.check_funnel_rate_limit(text, int, int) to anon, authenticated;
