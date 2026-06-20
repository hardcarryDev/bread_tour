// Spot menu data layer for Slice B (SPEC-BREADTOUR-001 / F4).
//
// Member-entered signature/recommended menus per spot. RLS (NFR-SEC-004) lets
// any member add/read menus; attribution comes from the joined profile so the
// UI can show "who recommended what" (REQ-F4-003). Empty menus are not stored
// as blank rows -- the empty case is represented by the absence of menu rows
// and rendered as "추천 메뉴 없음" by the UI (REQ-F4-004 / AC-F4-03).

import { supabase } from '../../lib/supabase';
import type { SpotMenu } from '../../types/database';

// One attached menu photo: storage object path + its public URL (REQ-F4).
export interface MenuImage {
  path: string;
  url: string;
}

// A menu row with its contributor's display name joined in (REQ-F4-003).
// `images` carries the attached photos (jsonb column on spot_menus).
export type SpotMenuWithAuthor = SpotMenu & {
  author?: { display_name: string | null } | null;
};

// Public Storage bucket holding menu photos (migration 20260620000600).
const MENU_IMAGE_BUCKET = 'menu-images';
// Reject oversized uploads client-side (server also enforces its own limits).
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

// PostgREST embedded-select string: join the contributor profile for attribution.
const MENU_SELECT = '*, author:profiles(display_name)';

// List menus for a single spot, each with its contributor (REQ-F4-002/003).
export async function listSpotMenus(
  spotId: string,
): Promise<SpotMenuWithAuthor[]> {
  const { data, error } = await supabase
    .from('spot_menus')
    .select(MENU_SELECT)
    .eq('spot_id', spotId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SpotMenuWithAuthor[];
}

// List menus for every spot in a tour, grouped by spot_id. Used by the map
// summary + spot detail so a single fetch covers the whole tour (REQ-F4-002).
export async function listSpotMenusForTour(
  spotIds: string[],
): Promise<Record<string, SpotMenuWithAuthor[]>> {
  if (spotIds.length === 0) return {};
  const { data, error } = await supabase
    .from('spot_menus')
    .select(MENU_SELECT)
    .in('spot_id', spotIds)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as SpotMenuWithAuthor[];
  const grouped: Record<string, SpotMenuWithAuthor[]> = {};
  for (const row of rows) {
    (grouped[row.spot_id] ??= []).push(row);
  }
  return grouped;
}

// Add a recommended menu for a spot, attributed to the author (REQ-F4-001).
// The name may be empty when the menu is photo-only (the photo IS the menu);
// callers that add from the spot form guard against a truly-empty (no text AND
// no photo) entry, so we no longer reject empty text here.
export async function addSpotMenu(params: {
  spotId: string;
  authorId: string;
  menuText: string;
}): Promise<SpotMenu> {
  const text = params.menuText.trim();
  const { data, error } = await supabase
    .from('spot_menus')
    .insert({
      spot_id: params.spotId,
      author_id: params.authorId,
      menu_text: text,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SpotMenu;
}

// Delete a recommended menu by id (REQ-F4). RLS (spot_menus_delete) allows the
// menu's author or the tour owner to delete; a non-permitted attempt surfaces as
// an error here rather than silently succeeding.
export async function deleteSpotMenu(menuId: string): Promise<void> {
  const { error } = await supabase
    .from('spot_menus')
    .delete()
    .eq('id', menuId);
  if (error) throw new Error(error.message);
}

// Sanitize a filename for use inside a storage object path (keep extension).
function safeName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  return ext ? `img.${ext}` : 'img';
}

// Upload one menu photo to the public bucket and return its { path, url }.
// Path is namespaced by tour + menu so objects are easy to attribute/clean up.
// The caller persists the returned descriptor into spot_menus.images.
export async function uploadMenuImage(
  file: File,
  params: { tourId: string; menuId: string },
): Promise<MenuImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 첨부할 수 있습니다.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('이미지가 너무 큽니다 (최대 8MB).');
  }
  // A time+random suffix keeps names unique without needing crypto.randomUUID
  // in every target environment. Date.now is fine in the browser.
  const unique = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
  const path = `${params.tourId}/${params.menuId}/${unique}_${safeName(file.name)}`;
  const { error } = await supabase.storage
    .from(MENU_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(MENU_IMAGE_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

// Replace a menu's image list (spot_menus.images). RLS (spot_menus_update,
// author/owner) is the real guard. Used to append a freshly uploaded image or
// to drop a removed one — the caller computes the new array.
export async function updateMenuImages(
  menuId: string,
  images: MenuImage[],
): Promise<void> {
  const { error } = await supabase
    .from('spot_menus')
    .update({ images })
    .eq('id', menuId);
  if (error) throw new Error(error.message);
}

// Best-effort removal of the underlying storage object(s) when an image is
// detached. A failure here is non-fatal (the row no longer references it) — the
// object simply lingers; we do not surface it as a user error.
export async function removeImageObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(MENU_IMAGE_BUCKET).remove(paths);
  } catch {
    // ignore — orphaned object cleanup is non-critical
  }
}
