-- Restaurant Reputation OS — initial schema + RLS
-- See PROJECT_CONTEXT.md for product context.

-- Required extensions
create extension if not exists "pgcrypto";
create extension if not exists "citext";

------------------------------------------------------------
-- Tables
------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  slug citext not null unique,
  logo_url text,
  google_review_url text,
  google_place_id text,
  created_at timestamptz not null default now()
);
create index businesses_owner_idx on public.businesses(owner_user_id);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid null,
  name text not null,
  slug text not null,
  source_type text not null check (
    source_type in ('table','counter','receipt','poster','delivery','other')
  ),
  table_code text,
  staff_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, slug)
);
create index campaigns_business_active_idx on public.campaigns(business_id, is_active);

create table public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  feedback_text text,
  contact_name text,
  contact_phone text,
  created_at timestamptz not null default now()
);
create index feedback_business_created_idx
  on public.feedback_submissions(business_id, created_at desc);

create table public.analytics_events (
  id bigserial primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  session_id uuid not null,
  event_type text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index analytics_business_created_idx
  on public.analytics_events(business_id, created_at desc);
create index analytics_campaign_event_idx
  on public.analytics_events(campaign_id, event_type);

------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------

alter table public.businesses enable row level security;
alter table public.campaigns enable row level security;
alter table public.feedback_submissions enable row level security;
alter table public.analytics_events enable row level security;

-- businesses: owner-scoped on all commands
create policy "businesses owner select"
  on public.businesses for select
  to authenticated
  using (owner_user_id = (select auth.uid()));

create policy "businesses owner insert"
  on public.businesses for insert
  to authenticated
  with check (owner_user_id = (select auth.uid()));

create policy "businesses owner update"
  on public.businesses for update
  to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy "businesses owner delete"
  on public.businesses for delete
  to authenticated
  using (owner_user_id = (select auth.uid()));

-- Public can resolve a slug to render /r/[slug] (anon read of basic columns).
-- App should select only display-safe columns when called as anon.
create policy "businesses anon read by slug"
  on public.businesses for select
  to anon
  using (true);

-- campaigns: owner-scoped via business_id; anon may read active campaigns.
create policy "campaigns owner all"
  on public.campaigns for all
  to authenticated
  using (
    business_id in (
      select id from public.businesses where owner_user_id = (select auth.uid())
    )
  )
  with check (
    business_id in (
      select id from public.businesses where owner_user_id = (select auth.uid())
    )
  );

create policy "campaigns anon read active"
  on public.campaigns for select
  to anon
  using (is_active = true);

-- feedback_submissions: write-only firehose.
-- Anyone (anon or authenticated) can insert; only the business owner can read.
create policy "feedback anyone insert"
  on public.feedback_submissions for insert
  to anon, authenticated
  with check (true);

create policy "feedback owner select"
  on public.feedback_submissions for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses where owner_user_id = (select auth.uid())
    )
  );

-- analytics_events: same write-only firehose shape as feedback.
create policy "analytics anyone insert"
  on public.analytics_events for insert
  to anon, authenticated
  with check (true);

create policy "analytics owner select"
  on public.analytics_events for select
  to authenticated
  using (
    business_id in (
      select id from public.businesses where owner_user_id = (select auth.uid())
    )
  );
