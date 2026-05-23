-- Migration 0006 — restaurant logo upload (owner-self-serve).
--
-- Adds:
--   1. businesses.logo_url           — public URL of the current logo, or null.
--   2. storage bucket "restaurant-logos" — public read, owner-scoped write.
--   3. storage RLS policies          — owners can write objects under their
--      own business's folder (path prefix = business UUID); super-admins
--      can write anywhere.
--
-- Why store the public URL rather than reconstruct it on read?
--   The funnel and dashboard read this in hot paths. Keeping a denormalised
--   URL avoids a second round-trip (signed-URL fetch) on every render. The
--   public bucket guarantees the URL stays valid as long as the row points
--   at a real object.

-- 1. Logo URL column. Nullable, no default — empty until first upload.
alter table public.businesses
  add column if not exists logo_url text;

-- 2. Public bucket. on conflict do nothing so re-running the migration
--    against an environment that already has the bucket is safe.
insert into storage.buckets (id, name, public)
values ('restaurant-logos', 'restaurant-logos', true)
on conflict (id) do nothing;

-- 3. RLS policies on storage.objects, scoped to this one bucket.
--    Path convention is "<business_id>/logo.<ext>" — the first folder
--    segment is the business UUID. We compare the segment as text against
--    businesses.id::text rather than casting the path to uuid, which would
--    raise on a malformed segment instead of evaluating to false.

create policy "logos owner write"
  on storage.objects
  as permissive
  for all
  to authenticated
  using (
    bucket_id = 'restaurant-logos'
    and exists (
      select 1
        from public.businesses b
       where b.id::text = (storage.foldername(name))[1]
         and public.has_business_access(auth.uid(), b.id)
    )
  )
  with check (
    bucket_id = 'restaurant-logos'
    and exists (
      select 1
        from public.businesses b
       where b.id::text = (storage.foldername(name))[1]
         and public.has_business_access(auth.uid(), b.id)
    )
  );

create policy "logos super admin write"
  on storage.objects
  as permissive
  for all
  to authenticated
  using (
    bucket_id = 'restaurant-logos'
    and public.is_super_admin(auth.uid())
  )
  with check (
    bucket_id = 'restaurant-logos'
    and public.is_super_admin(auth.uid())
  );
