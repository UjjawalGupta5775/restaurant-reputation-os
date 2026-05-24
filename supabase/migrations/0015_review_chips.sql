-- Migration 0015 — owner-managed review prompt chips.
--
-- The customer funnel (/r/[slug]) renders a short list of phrase
-- suggestions ("chips") after star selection — "Friendly staff",
-- "Quick service", etc. — that the customer can tap to append into
-- their Google review draft. Until now this list was hardcoded
-- platform-wide (lib/funnel/chips.ts). Owners want vocabulary that
-- matches their restaurant ("Wood-fired crust" for a pizzeria,
-- "Fresh fish" for sushi) and the ability to turn off prompts that
-- don't fit.
--
-- Hard compliance rule preserved: chips must remain rating-neutral
-- factual observations. Owner UI enforces this via editorial copy +
-- soft validation. Chips are shown at ALL ratings; there is no
-- per-rating gating — that would violate the "always-visible dual
-- path" rule from PROJECT_CONTEXT.md.
--
-- Display behavior is also owner-controlled via two new columns on
-- the businesses table: a mode (manual | random) and a customer-side
-- count cap (4..16). 'manual' renders the active chips in the
-- owner's drag-ordered sequence; 'random' shuffles per page load so
-- restaurants with many chips can rotate variety.

create table public.review_chips (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 2 and 40),
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index review_chips_business_position_idx
  on public.review_chips(business_id, position, created_at);

create index review_chips_business_active_idx
  on public.review_chips(business_id) where is_active;

alter table public.review_chips enable row level security;

-- Owner CRUD via the existing has_business_access helper (covers
-- super-admin via the same path). Single FOR ALL — same pattern as
-- response_templates (migration 0010).
create policy "review_chips owner all"
  on public.review_chips for all
  to authenticated
  using (public.has_business_access((select auth.uid()), business_id))
  with check (public.has_business_access((select auth.uid()), business_id));

-- Anonymous read of active chips for the customer funnel (which
-- runs unauthenticated on /r/[slug]). Mirrors the
-- "campaigns anon read active" policy in migration 0001.
create policy "review_chips anon read active"
  on public.review_chips for select
  to anon
  using (is_active = true);

-- updated_at maintenance — follows the subscriptions_set_updated_at
-- pattern from migration 0013 (per-table function to avoid coupling
-- timestamp logic into a shared helper that's owned by another
-- migration).
create or replace function public.review_chips_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger review_chips_set_updated_at
  before update on public.review_chips
  for each row execute function public.review_chips_set_updated_at();

-- Per-business display settings. Lives on the businesses row (not on
-- the chips themselves) because it's one-knob-per-business, not
-- per-chip. 'manual' is the safe default — owners who don't visit
-- the new settings page see the same ordering they configured.
alter table public.businesses
  add column chip_display_mode text not null default 'manual'
    check (chip_display_mode in ('manual', 'random')),
  add column chip_display_limit int not null default 8
    check (chip_display_limit between 4 and 16);

-- Backfill: seed every existing business with the same 8 defaults
-- the customer funnel currently shows. Owners can immediately start
-- editing instead of starting from a blank list.
insert into public.review_chips (business_id, label, position)
select b.id, chip.label, chip.position
from public.businesses b
cross join (values
  ('Friendly staff', 0),
  ('Quick service', 1),
  ('Food was hot', 2),
  ('Loved the ambiance', 3),
  ('Easy ordering', 4),
  ('Good portion size', 5),
  ('Clean space', 6),
  ('Would visit again', 7)
) as chip(label, position);

-- Auto-seed every new business with the defaults. SECURITY DEFINER
-- so the insert bypasses RLS regardless of who created the business
-- (super-admin via service role, owner via signup flow). search_path
-- pinned per the audit-log convention (migration 0012).
create or replace function public.seed_default_review_chips()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.review_chips (business_id, label, position)
  values
    (new.id, 'Friendly staff', 0),
    (new.id, 'Quick service', 1),
    (new.id, 'Food was hot', 2),
    (new.id, 'Loved the ambiance', 3),
    (new.id, 'Easy ordering', 4),
    (new.id, 'Good portion size', 5),
    (new.id, 'Clean space', 6),
    (new.id, 'Would visit again', 7);
  return new;
end;
$$;

create trigger seed_review_chips_after_business_insert
  after insert on public.businesses
  for each row execute function public.seed_default_review_chips();
