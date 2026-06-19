// Stamp data layer for Slice C (SPEC-BREADTOUR-001 / F1).
//
// Pure, typed wrappers over the Supabase PostgREST client. Access control lives
// entirely in Postgres RLS (NFR-SEC-004): a member may only INSERT stamps for
// their own user_id, and only the stamp owner or the tour owner may
// cancel/correct (UPDATE). A denied operation surfaces as a thrown error here;
// this layer never weakens that enforcement.
//
// Arrival time is the SERVER timestamp (A6 / REQ-F1-003): we NEVER send a client
// `arrived_at` on insert — the DB column default (now()) is the source of truth.
// Raw coordinate streams are never sent or stored (NFR-GEO-006 / A12); only the
// resulting spot_id + user_id are persisted.
//
// Duplicate prevention + re-stamp (REQ-F1-004 / REQ-F1-011) rely on the
// partial unique index `UNIQUE(spot_id, user_id) WHERE cancelled_at IS NULL`:
// a second valid stamp fails with a unique-constraint error, but a new stamp is
// allowed once the prior one is soft-cancelled.

import { supabase } from '../../lib/supabase';
import type { ManualCheckInRequest, Stamp } from '../../types/database';
import type { SpotStampStatus } from '../map/MapView';

// Stamp status enriched with the ids the cancel/correct UI needs (permission is
// still enforced by RLS; these ids only let the UI decide what to OFFER).
export type StampStatus = SpotStampStatus & {
  stampId?: string;
  userId?: string;
};

// @MX:ANCHOR: [AUTO] createStamp is the single auto-stamp insert path; it sends
// only spot_id + user_id + method and relies on the DB default for arrived_at.
// @MX:REASON: REQ-F1-002/003/004 / A6 — server time is the arrival source of
// truth and the partial unique index prevents duplicates; sending a client
// arrived_at here would corrupt the trusted record and break duplicate handling.
export async function createStamp(params: {
  spotId: string;
  userId: string;
}): Promise<Stamp> {
  const { data, error } = await supabase
    .from('stamps')
    .insert({
      spot_id: params.spotId,
      user_id: params.userId,
      method: 'auto',
      // No arrived_at — DB default now() owns it (A6).
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Stamp;
}

// List a tour's VALID (non-cancelled) stamps. Used to render arrival status in
// visit order (REQ-F1-005) and to feed MapView's stampBySpot prop.
export async function listStamps(tourId: string): Promise<Stamp[]> {
  const { data, error } = await supabase
    .from('stamps')
    .select('*')
    .eq('tour_id', tourId)
    .is('cancelled_at', null)
    .order('arrived_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Stamp[];
}

// Build the spot_id -> status map MapView + the progress view consume.
export function stampMapBySpot(stamps: Stamp[]): Record<string, StampStatus> {
  const map: Record<string, StampStatus> = {};
  for (const s of stamps) {
    // Keep the first (earliest) valid stamp per spot (REQ-F1-004).
    if (map[s.spot_id]) continue;
    map[s.spot_id] = {
      stamped: true,
      arrivedAt: s.arrived_at,
      stampId: s.id,
      userId: s.user_id,
    };
  }
  return map;
}

// Soft-cancel a stamp by setting cancelled_at (REQ-F1-009). Soft-cancel (vs row
// delete) preserves change history AND frees the partial unique index so the
// member can re-stamp the same spot later (REQ-F1-011 / AC-F1-10). Permission
// (owner or tour owner) is enforced by the stamps UPDATE RLS policy.
export async function cancelStamp(stampId: string): Promise<void> {
  const { error } = await supabase
    .from('stamps')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', stampId);
  if (error) throw new Error(error.message);
}

// Correct a stamp's arrival time (REQ-F1-009). The corrected value is an
// explicit override supplied by a permitted member (RLS-enforced).
export async function correctStampArrival(
  stampId: string,
  arrivedAt: string,
): Promise<void> {
  const { error } = await supabase
    .from('stamps')
    .update({ arrived_at: arrivedAt })
    .eq('id', stampId);
  if (error) throw new Error(error.message);
}

// NOTE: there is intentionally NO direct manual-stamp insert here. The only
// sanctioned path for a manual stamp is the request -> peer-confirm flow
// (requestManualCheckIn + confirmManualCheckIn -> confirm_manual_checkin RPC),
// which enforces "confirmed by a DIFFERENT member" server-side (AC-F1-04). A
// client-side INSERT into stamps with method='manual' would bypass that
// peer-confirmation requirement (M-01), so it is deliberately not exposed.

// ---------------------------------------------------------------------------
// Manual check-in REQUEST -> peer CONFIRM flow (REQ-F1-007 / AC-F1-04).
//
// When auto-stamp is unavailable (GPS denied / accuracy insufficient), a member
// records a PENDING request here. The request is NOT a stamp: the stamp is only
// created once a DIFFERENT member confirms it via confirm_manual_checkin(). This
// keeps the stamps table meaning "valid arrival" and isolates the pending state
// (and the requester != confirmer rule) in manual_checkin_requests + the RPC.
// ---------------------------------------------------------------------------

// @MX:ANCHOR: [AUTO] requestManualCheckIn is the single entry point for the
// manual-checkin fallback; it inserts a pending request only and NEVER a stamp.
// @MX:REASON: AC-F1-04 — the stamp must not exist until a peer confirms, so this
// path deliberately writes to manual_checkin_requests (not stamps); tour_id is
// trigger-set from the spot and confirmed_by/stamp_id are server-owned.
export async function requestManualCheckIn(params: {
  spotId: string;
  userId: string;
}): Promise<ManualCheckInRequest> {
  const { data, error } = await supabase
    .from('manual_checkin_requests')
    .insert({
      spot_id: params.spotId,
      requester_id: params.userId,
      status: 'pending',
      // No tour_id (trigger-set), no confirmed_by/stamp_id (server-owned).
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ManualCheckInRequest;
}

// List a tour's PENDING manual check-in requests so other members can see and
// confirm them. RLS already restricts this to tour members (NFR-SEC-004).
export async function listPendingCheckIns(
  tourId: string,
): Promise<ManualCheckInRequest[]> {
  const { data, error } = await supabase
    .from('manual_checkin_requests')
    .select('*')
    .eq('tour_id', tourId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ManualCheckInRequest[];
}

// @MX:ANCHOR: [AUTO] confirmManualCheckIn delegates to the confirm_manual_checkin
// RPC, the only path that turns a pending request into a manual stamp.
// @MX:REASON: AC-F1-04 — peer confirmation must be atomic and confirmer-checked
// server-side; the client guard here is a fast fail only, the RPC (SECURITY
// DEFINER) is the real guard that enforces confirmer != requester and creates the
// stamp with server arrived_at (A6) under the partial-unique re-stamp index.
export async function confirmManualCheckIn(params: {
  requestId: string;
  confirmerId: string;
  requesterId: string;
}): Promise<string> {
  if (params.confirmerId === params.requesterId) {
    throw new Error('A manual check-in must be confirmed by another member.');
  }
  const { data, error } = await supabase.rpc('confirm_manual_checkin', {
    p_request_id: params.requestId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

// Withdraw a pending request (REQ-F1-007). Soft-cancel (status='cancelled')
// preserves history and frees the pending partial-unique index so the member can
// request again. Permission (requester or tour owner) is enforced by RLS.
export async function cancelManualCheckIn(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('manual_checkin_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId);
  if (error) throw new Error(error.message);
}
