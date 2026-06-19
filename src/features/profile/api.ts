// Profile data layer (SPEC-BREADTOUR-001 / Feature 1).
//
// Reads display names for a set of user ids so the UI can show real names
// instead of raw UUIDs in the member list and the presence indicator
// (REQ-F5-003). RLS already lets a user read co-members' profiles (the same
// permission the menu "contributor name" join relies on, see features/menu/api),
// so this is a plain bulk select by id — it never weakens that boundary.

import { supabase } from '../../lib/supabase';

// user_id -> display_name (null when the profile has no name set yet).
export type DisplayNameMap = Record<string, string | null>;

// The caller's own profile, as needed by the "정보 변경" (profile edit) page.
export interface MyProfile {
  id: string;
  display_name: string | null;
}

// Resolve a user id to a label for the UI (REQ-F5-003 / Feature 1): prefer the
// display name, and fall back to "(이름 없음)" when the profile has no name (or
// the id is unknown). The member/presence row already carries a stable key, so
// the label itself does not need to encode the id to stay distinguishable.
export function displayNameFor(
  userId: string | null | undefined,
  names: DisplayNameMap,
): string {
  if (userId && names[userId]) return names[userId] as string;
  return '(이름 없음)';
}

// @MX:ANCHOR: [AUTO] listProfiles is the single client surface for resolving
// user ids to display names; the member list (TourDetail) and presence labels
// (ConnectedMembers) both route through here, so the empty-input short-circuit
// and the RLS-permitted bulk-select shape are an invariant other callers rely on.
// @MX:REASON: REQ-F5-003 / Feature 1 — display names must replace UUIDs across
// every member surface; centralising the read keeps the RLS read pattern and the
// "no ids -> no query" guarantee in one auditable place.
export async function listProfiles(userIds: string[]): Promise<DisplayNameMap> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; display_name: string | null }[];
  const map: DisplayNameMap = {};
  for (const row of rows) {
    map[row.id] = row.display_name;
  }
  return map;
}

// Read the caller's own profile so the "정보 변경" page can prefill the current
// name. RLS already lets a user read their own row (id = auth.uid()), so this
// is a plain single-row select; a missing row yields null rather than throwing.
export async function getMyProfile(userId: string): Promise<MyProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MyProfile | null) ?? null;
}

// @MX:ANCHOR: [AUTO] updateMyDisplayName is the single write path for the
// "정보 변경" feature; the edit page is its only caller today but the trim +
// non-empty validation and own-row update shape are the invariant the UI relies
// on (it shows the thrown Korean message verbatim on empty input).
// @MX:REASON: only the display name is editable (no email/password); the
// profiles_update RLS policy (id = auth.uid()) is the real ownership guard, so
// this never targets another user's row and must not be widened to do so.
export async function updateMyDisplayName(
  userId: string,
  displayName: string,
): Promise<void> {
  const trimmed = displayName.trim();
  // Reject empty/whitespace before any network call. The page surfaces this
  // Korean message directly (Korean-only UX), so it must not leak through
  // errorMessage()'s generic fallback.
  if (!trimmed) throw new Error('이름을 입력해 주세요.');

  // profiles is the source of truth (the member list + presence read it). RLS
  // (id = auth.uid()) enforces own-row; the eq('id', userId) keeps the intent
  // explicit and the query well-formed.
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: trimmed })
    .eq('id', userId);
  if (error) throw new Error(error.message);

  // Best-effort: keep the auth user metadata in sync with the profile so any
  // surface reading raw_user_meta_data stays consistent. A failure here must
  // NOT fail the name change — the profile row already succeeded.
  try {
    await supabase.auth.updateUser({ data: { display_name: trimmed } });
  } catch {
    // Swallow: metadata sync is non-authoritative for the member/presence UI.
  }
}
