-- Migration 0007 — fix logo upload RLS column shadowing.
--
-- The 0006 policies referenced `name` unqualified inside the subquery, so
-- Postgres resolved it to `businesses.name` (the restaurant's display name)
-- instead of `storage.objects.name` (the upload path). Every owner upload
-- failed with "new row violates row-level security policy" because the
-- business name was being fed to storage.foldername() and never matched
-- the business UUID prefix.
--
-- Fix: qualify the reference with storage.objects.name.

drop policy if exists "logos owner write" on storage.objects;

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
       where b.id::text = (storage.foldername(storage.objects.name))[1]
         and public.has_business_access(auth.uid(), b.id)
    )
  )
  with check (
    bucket_id = 'restaurant-logos'
    and exists (
      select 1
        from public.businesses b
       where b.id::text = (storage.foldername(storage.objects.name))[1]
         and public.has_business_access(auth.uid(), b.id)
    )
  );
