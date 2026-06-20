// Spot menu data layer for Slice B (SPEC-BREADTOUR-001 / F4).
//
// Member-entered signature/recommended menus per spot. RLS (NFR-SEC-004) lets
// any member add/read menus; attribution comes from the joined profile so the
// UI can show "who recommended what" (REQ-F4-003). Empty menus are not stored
// as blank rows -- the empty case is represented by the absence of menu rows
// and rendered as "추천 메뉴 없음" by the UI (REQ-F4-004 / AC-F4-03).

import { supabase } from '../../lib/supabase';
import type { SpotMenu } from '../../types/database';

// A menu row with its contributor's display name joined in (REQ-F4-003).
export type SpotMenuWithAuthor = SpotMenu & {
  author?: { display_name: string | null } | null;
};

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
// A blank menu is rejected here -- "no menu" is the absence of a row, not a
// stored empty string (REQ-F4-004).
export async function addSpotMenu(params: {
  spotId: string;
  authorId: string;
  menuText: string;
}): Promise<SpotMenu> {
  const text = params.menuText.trim();
  if (text.length === 0) {
    throw new Error('Cannot add an empty menu');
  }
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
