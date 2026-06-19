// Tour data layer for Slice A (SPEC-BREADTOUR-001 / F5 + F6).
//
// Pure, typed wrappers over the Supabase PostgREST client. The real access
// control lives in Postgres RLS (NFR-SEC-004); these functions are the typed
// client surface and never weaken that enforcement. Spots / map / stamp data
// belong to later slices and are intentionally absent here.

import { supabase } from '../../lib/supabase';
import type {
  Tour,
  TourInvite,
  TourMember,
  TourMemberRole,
} from '../../types/database';

// @MX:ANCHOR: [AUTO] createTour is the single creation path for tours; the
// owner-membership row is created server-side by the tours_add_owner_membership
// trigger, so callers must never insert tour_members directly here.
// @MX:REASON: REQ-F6-001 / AC-F6-01 — creator-becomes-owner invariant is
// enforced by the DB trigger; bypassing this entry point would break it.
export async function createTour(params: {
  name: string;
  userId: string;
}): Promise<Tour> {
  const { data, error } = await supabase
    .from('tours')
    .insert({ name: params.name, owner_id: params.userId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Tour;
}

// List the tours the user belongs to (RLS also restricts this to members).
export async function listMyTours(userId: string): Promise<Tour[]> {
  const { data, error } = await supabase
    .from('tour_members')
    .select('tours(*)')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  // The select returns rows shaped { tours: Tour }. Flatten when the embedded
  // relation is present; otherwise the rows are already tours (test shape).
  const rows = (data ?? []) as unknown[];
  return rows.map((r) => {
    const rec = r as { tours?: Tour };
    return (rec.tours ?? r) as Tour;
  });
}

// Fetch a single tour. Returns null when RLS hides the row (REQ-F5-006).
export async function getTour(tourId: string): Promise<Tour | null> {
  const { data, error } = await supabase
    .from('tours')
    .select('*')
    .eq('id', tourId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Tour) ?? null;
}

// Delete a tour. Owner-only is enforced by RLS (tours_delete); a non-owner
// attempt surfaces as an error here (REQ-F6-004 / AC-F6-04).
export async function deleteTour(tourId: string): Promise<void> {
  const { error } = await supabase.from('tours').delete().eq('id', tourId);
  if (error) throw new Error(error.message);
}

// List members of a tour for the member list + permission UI.
export async function listMembers(tourId: string): Promise<TourMember[]> {
  const { data, error } = await supabase
    .from('tour_members')
    .select('*')
    .eq('tour_id', tourId);
  if (error) throw new Error(error.message);
  return (data ?? []) as TourMember[];
}

// Resolve the current user's role within a tour, or null if not a member.
// Drives owner-vs-member UI gating (REQ-F6-004/005/006).
export async function getMyRole(params: {
  tourId: string;
  userId: string;
}): Promise<TourMemberRole | null> {
  const { data, error } = await supabase
    .from('tour_members')
    .select('role')
    .eq('tour_id', params.tourId)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const rec = data as { role: TourMemberRole } | null;
  return rec ? rec.role : null;
}

// Remove a member by membership-row id. Owner-only via RLS (REQ-F6-004).
export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('tour_members')
    .delete()
    .eq('id', memberId);
  if (error) throw new Error(error.message);
}

// Create an invite row. token + status default server-side. invited_by must be
// the current user (RLS WITH CHECK). REQ-F6-002 / AC-F6-02.
export async function createInvite(params: {
  tourId: string;
  invitedBy: string;
  email?: string | null;
}): Promise<TourInvite> {
  const { data, error } = await supabase
    .from('tour_invites')
    .insert({
      tour_id: params.tourId,
      invited_by: params.invitedBy,
      invited_email: params.email ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TourInvite;
}

// Build the shareable invite URL for a token. Defaults to the running origin.
// Includes Vite's BASE_URL so the link stays valid under a subpath deployment
// (e.g. GitHub Pages project site /<repo>/), where window.location.origin alone
// would drop the subpath. BASE_URL is '/' for local dev and root deployments.
export function inviteLinkFor(token: string, origin?: string): string {
  const root =
    origin ??
    (typeof window !== 'undefined' ? window.location.origin : '');
  // import.meta.env.BASE_URL is e.g. '/' or '/bread_tour/'. Strip trailing
  // slash, then compose origin + base + path with no double slashes.
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${root}${base}/invite/${token}`;
}

// @MX:ANCHOR: [AUTO] acceptInvite is the only path that turns an invite into a
// membership; it delegates to the accept_invite() RPC which validates the
// pending invite, inserts the membership, and marks the invite accepted in ONE
// transaction, returning the tour id.
// @MX:REASON: REQ-F6-003 / AC-F6-03 — the previous client-side
// SELECT->INSERT->UPDATE sequence was non-atomic: a failed UPDATE left the user
// a member while the invite stayed reusable (H-02). The SECURITY DEFINER RPC
// makes the three steps a single transaction so partial state cannot occur.
// userId is unused here (the RPC resolves the caller via auth.uid()); it is kept
// in the signature for call-site stability.
export async function acceptInvite(params: {
  token: string;
  userId: string;
}): Promise<{ tourId: string }> {
  const { data, error } = await supabase.rpc('accept_invite', {
    p_token: params.token,
  });
  if (error) throw new Error(error.message);
  return { tourId: data as string };
}

// Reject an invite: mark status rejected, never create a membership (AC-F6-03).
export async function rejectInvite(token: string): Promise<void> {
  const { error } = await supabase
    .from('tour_invites')
    .update({ status: 'rejected' })
    .eq('token', token);
  if (error) throw new Error(error.message);
}
