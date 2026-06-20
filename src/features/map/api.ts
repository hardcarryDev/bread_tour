// Spot / map data layer for Slice B (SPEC-BREADTOUR-001 / F1 data + F3 + F5-007).
//
// Pure, typed wrappers over the Supabase PostgREST client. Access control lives
// in Postgres RLS (NFR-SEC-004): members may add/edit spots, owners may delete
// (DELETE policy), and reorder_spots() checks membership internally (D11). These
// functions never weaken that enforcement -- a denied operation surfaces as a
// thrown error here. Raw GPS coordinates are NOT handled in this slice; only the
// fixed spot location is stored (REQ-F1-001 / NFR-GEO-006). GPS auto-stamp logic
// belongs to Slice C.

import { supabase } from '../../lib/supabase';
import type { Spot, SpotKind } from '../../types/database';

// Default arrival-detection radius in metres (SPEC A3 / REQ-F1-001).
export const DEFAULT_RADIUS_M = 50;

// List a tour's spots in planned visit order (REQ-F3-001 / AC-F3-01).
export async function listSpots(tourId: string): Promise<Spot[]> {
  const { data, error } = await supabase
    .from('spots')
    .select('*')
    .eq('tour_id', tourId)
    .order('order_index', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Spot[];
}

// List a tour's selectable 종류 options in creation order (oldest first, so the
// 빵집/음식점 defaults lead). Backs the spot form dropdown (migration 10).
export async function listSpotKinds(tourId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('spot_kinds')
    .select('name')
    .eq('tour_id', tourId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { name: string }).name);
}

// Add a new 종류 option to a tour (the "종류 추가" button). Returns the trimmed
// label. A duplicate (unique tour_id+name) is treated as success — the option
// already exists, which is the caller's desired end state.
export async function addSpotKind(
  tourId: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  const { error } = await supabase
    .from('spot_kinds')
    .insert({ tour_id: tourId, name: trimmed });
  // 23505 = unique_violation: the label is already in the list.
  if (error && (error as { code?: string }).code !== '23505') {
    throw new Error(error.message);
  }
  return trimmed;
}

// @MX:ANCHOR: [AUTO] addSpot is the single registration path for spots; it
// stores the fixed coordinate + arrival radius and appends the spot at the next
// 1-based order_index so reorder_spots() (1..N) stays consistent.
// @MX:REASON: REQ-F1-001 / AC-F1-06 — coordinate + radius (default 50m) storage
// is the contract Slice C's GPS auto-stamp depends on; the order_index append
// invariant keeps the visit sequence gap-free with the reorder RPC.
export async function addSpot(params: {
  tourId: string;
  name: string;
  lat: number;
  lng: number;
  kind?: SpotKind;
  radiusM?: number;
  // Current spot count for the tour; the new spot is appended after it.
  existingCount: number;
}): Promise<Spot> {
  const { data, error } = await supabase
    .from('spots')
    .insert({
      tour_id: params.tourId,
      name: params.name,
      kind: params.kind ?? '빵집',
      lat: params.lat,
      lng: params.lng,
      radius_m: params.radiusM ?? DEFAULT_RADIUS_M,
      order_index: params.existingCount + 1,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Spot;
}

// Edit an existing spot (name / kind / coordinate / radius). REQ-F4-001 edit.
export async function updateSpot(
  spotId: string,
  patch: Partial<Pick<Spot, 'name' | 'kind' | 'lat' | 'lng' | 'radius_m'>>,
): Promise<Spot> {
  const { data, error } = await supabase
    .from('spots')
    .update(patch)
    .eq('id', spotId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Spot;
}

// Delete a spot. Owner-only is enforced by RLS (spots DELETE policy); the FK
// cascade removes the spot's menus + stamps server-side (REQ-F6-007 / EC-09).
export async function deleteSpot(spotId: string): Promise<void> {
  const { error } = await supabase.from('spots').delete().eq('id', spotId);
  if (error) throw new Error(error.message);
}

// @MX:ANCHOR: [AUTO] reorderSpots is the only client path that changes visit
// order; it delegates to the reorder_spots RPC which renumbers 1..N atomically.
// @MX:REASON: REQ-F5-007 / AC-F5-06 / D11 — concurrent reorders must resolve to
// a single gap-free sequence; doing N client UPDATEs instead of this RPC would
// break that invariant under concurrency.
export async function reorderSpots(
  tourId: string,
  orderedIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc('reorder_spots', {
    p_tour_id: tourId,
    p_ordered_ids: orderedIds,
  });
  if (error) throw new Error(error.message);
}
