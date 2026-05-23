-- Migration 0010 — response templates.
--
-- Owners read incoming private feedback and want canned replies they can
-- copy-paste into WhatsApp/SMS/email (the platform itself never sends
-- outbound messages — that stays out of scope). Templates are per-
-- business and owner-managed; super-admins inherit access via the
-- existing has_business_access helper.
--
-- Body supports light substitution tokens — {{name}}, {{rating}},
-- {{restaurant}} — substituted client-side at copy time, so no schema
-- changes are needed when we add more tokens.

create table public.response_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  body text not null check (char_length(body) between 1 and 1000),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index response_templates_business_sort_idx
  on public.response_templates(business_id, sort_order, created_at);

alter table public.response_templates enable row level security;

-- Single FOR ALL policy: anyone with business access can read/write
-- templates for that business. has_business_access already returns true
-- for super-admins, so this covers both roles without two policies.
create policy "response_templates owner all"
  on public.response_templates for all
  to authenticated
  using (public.has_business_access((select auth.uid()), business_id))
  with check (public.has_business_access((select auth.uid()), business_id));
