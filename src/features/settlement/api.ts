// Settlement (정산 / dutch-pay) data layer for Slice E (SPEC-BREADTOUR-001 / F-정산).
//
// One settlement row per spot (UNIQUE(spot_id)), so saving is an UPSERT on
// spot_id: editing a spot's bill overwrites the single existing row rather than
// stacking new ones. Access control lives entirely in Postgres RLS (NFR-SEC-004):
// any tour member may select/insert/update/delete; a denied operation surfaces as
// a thrown error here (this layer never weakens that enforcement).
//
// tour_id is auto-synced from the spot by the sync_settlement_tour_id trigger
// (mirrors stamps), so passing it on upsert is harmless but not required — we
// pass it so the row is correct even before the trigger fires.

import { supabase } from '../../lib/supabase';
import type { SpotSettlement } from '../../types/database';

// List every settlement for a tour, one row per settled spot (keyed by spot_id
// downstream). Used by the hook to feed the per-row caption + tour summary.
export async function listSettlements(
  tourId: string,
): Promise<SpotSettlement[]> {
  const { data, error } = await supabase
    .from('spot_settlements')
    .select('*')
    .eq('tour_id', tourId);
  if (error) throw new Error(error.message);
  return (data ?? []) as SpotSettlement[];
}

// Create or replace the single settlement for a spot (UPSERT on spot_id). Any
// member may save; RLS is the real guard. `created_by` records who last saved.
export async function upsertSettlement(params: {
  spotId: string;
  tourId: string;
  amount: number;
  payerIds: string[];
  participantIds: string[];
  settledIds: string[];
  userId: string;
}): Promise<SpotSettlement> {
  const { data, error } = await supabase
    .from('spot_settlements')
    .upsert(
      {
        spot_id: params.spotId,
        tour_id: params.tourId,
        amount: params.amount,
        payer_ids: params.payerIds,
        participant_ids: params.participantIds,
        settled_ids: params.settledIds,
        created_by: params.userId,
      },
      { onConflict: 'spot_id' },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SpotSettlement;
}

// Remove a spot's settlement entirely (the spot is no longer split). Deleting by
// spot_id matches the one-row-per-spot model; RLS allows any member to delete.
export async function deleteSettlement(spotId: string): Promise<void> {
  const { error } = await supabase
    .from('spot_settlements')
    .delete()
    .eq('spot_id', spotId);
  if (error) throw new Error(error.message);
}
