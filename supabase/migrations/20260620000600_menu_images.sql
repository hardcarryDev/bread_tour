-- =============================================================================
-- SPEC-BREADTOUR-001 :: Migration / Signature-menu images (REQ-F4)
-- Attach one or more photos to a signature menu.
-- =============================================================================
-- Design: store the image list as a JSONB array on spot_menus rather than a
-- separate table. Each element is { "path": <storage object path>, "url":
-- <public URL> }. This reuses the existing spot_menus RLS (author/owner may
-- update) and the existing realtime subscription (a spot_menus UPDATE already
-- triggers other members' menu reloads), so image changes reflect live with no
-- new policies or publication entries.
--
-- The binary files live in a PUBLIC Storage bucket (menu-images); the bucket is
-- public so the saved URL renders directly in an <img>. Security note: a public
-- bucket means anyone who has the (unguessable) URL can view the image — bakery
-- menu photos, low sensitivity. Upload/delete are still gated by storage RLS.
-- =============================================================================

alter table public.spot_menus
  add column if not exists images jsonb not null default '[]'::jsonb;

-- Public bucket for menu photos.
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do update set public = true;

-- Storage object policies (scoped to the menu-images bucket).
-- INSERT: any authenticated user may upload, bound to themselves as owner.
drop policy if exists "menu_images_insert" on storage.objects;
create policy "menu_images_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-images' and owner = auth.uid ());

-- SELECT: readable by anyone (public bucket; also served via the public URL).
drop policy if exists "menu_images_select" on storage.objects;
create policy "menu_images_select" on storage.objects
  for select to public
  using (bucket_id = 'menu-images');

-- DELETE: the uploader may remove their own objects.
drop policy if exists "menu_images_delete" on storage.objects;
create policy "menu_images_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-images' and owner = auth.uid ());
