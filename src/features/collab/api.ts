// Realtime collaboration data layer for Slice D (SPEC-BREADTOUR-001 / F5).
//
// Thin wrapper over Supabase Realtime that subscribes one tour-scoped channel to
// row-level postgres_changes for the collaborative tables (spots, spot_menus,
// stamps, tour_members) and to presence. RLS already restricts which rows a
// subscriber receives (migration 3 + the realtime publication in migration 4);
// the per-table `filter: tour_id=eq.<id>` here only trims cross-tour noise, it
// is NOT a security boundary (NFR-SEC-004 — security lives in RLS).
//
// Conflict policy is row-level last-write-wins on the SERVER updated_at
// (NFR-CONFLICT-002): this layer never sends client time. It simply forwards the
// incoming row (which already carries the server updated_at) to the hook, which
// decides whether the local user's pending edit was overwritten.
//
// The subscribe call returns an async cleanup so the React hook can tear the
// channel down on unmount with no leaks.

import { supabase } from '../../lib/supabase';

// A connected member as seen through presence (REQ-F5-003).
export interface PresenceMember {
  user_id: string;
  display_name?: string | null;
}

// Minimal shape of a postgres_changes payload we rely on. The full supabase-js
// type carries more, but the hook only needs eventType + new/old rows.
export interface RealtimeChange {
  eventType?: 'INSERT' | 'UPDATE' | 'DELETE';
  table?: string;
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}

export interface SubscribeOptions {
  // Presence identity for this client (the current user id).
  presenceKey: string;
  onSpotsChange?: (change: RealtimeChange) => void;
  onMenusChange?: (change: RealtimeChange) => void;
  onStampsChange?: (change: RealtimeChange) => void;
  onMembersChange?: (change: RealtimeChange) => void;
  // Pending manual check-in requests (REQ-F1-007): broadcast so another member
  // can see and confirm a request live, and so the requester learns of their
  // confirmation.
  onManualCheckInChange?: (change: RealtimeChange) => void;
  onPresence?: (members: PresenceMember[]) => void;
  // Channel connection status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' |
  // 'CLOSED' (from supabase-js). Drives the offline/reconnect logic.
  onStatus?: (status: string) => void;
}

// Map each collaborative table to its change handler so we register one
// postgres_changes subscription per table, filtered to this tour.
const TABLE_HANDLERS: Array<{
  table: string;
  pick: (o: SubscribeOptions) => ((c: RealtimeChange) => void) | undefined;
}> = [
  { table: 'spots', pick: (o) => o.onSpotsChange },
  { table: 'spot_menus', pick: (o) => o.onMenusChange },
  { table: 'stamps', pick: (o) => o.onStampsChange },
  { table: 'tour_members', pick: (o) => o.onMembersChange },
  { table: 'manual_checkin_requests', pick: (o) => o.onManualCheckInChange },
];

// Flatten supabase presenceState() (keyed by presence ref, each holding an array
// of tracked payloads) into a de-duplicated member list keyed by user_id.
function flattenPresence(
  state: Record<string, unknown[]>,
): PresenceMember[] {
  const byUser = new Map<string, PresenceMember>();
  for (const entries of Object.values(state)) {
    for (const raw of entries) {
      const p = raw as Partial<PresenceMember>;
      if (typeof p.user_id === 'string' && !byUser.has(p.user_id)) {
        byUser.set(p.user_id, {
          user_id: p.user_id,
          display_name: p.display_name ?? null,
        });
      }
    }
  }
  return [...byUser.values()];
}

// @MX:ANCHOR: [AUTO] subscribeTourRealtime is the single entry point that turns
// a tour id into one live Realtime channel (row changes + presence + status).
// @MX:REASON: REQ-F5-002/003/005 — every member viewing a tour wires live
// reflection, presence, and offline detection through here; the returned cleanup
// is the only correct teardown path, so callers must not create channels ad hoc.
export function subscribeTourRealtime(
  tourId: string,
  options: SubscribeOptions,
): () => Promise<void> {
  const channel = supabase.channel(`tour:${tourId}`, {
    config: { presence: { key: options.presenceKey } },
  });

  // One row-change subscription per collaborative table, scoped to this tour.
  for (const { table, pick } of TABLE_HANDLERS) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        filter: `tour_id=eq.${tourId}`,
      },
      (payload: unknown) => {
        pick(options)?.(payload as RealtimeChange);
      },
    );
  }

  // Presence: report the connected-member list on every sync/join/leave.
  const emitPresence = () => {
    options.onPresence?.(
      flattenPresence(
        channel.presenceState() as unknown as Record<string, unknown[]>,
      ),
    );
  };
  channel.on('presence', { event: 'sync' }, emitPresence);
  channel.on('presence', { event: 'join' }, emitPresence);
  channel.on('presence', { event: 'leave' }, emitPresence);

  channel.subscribe((status: string) => {
    options.onStatus?.(status);
    if (status === 'SUBSCRIBED') {
      // Announce our presence once joined. display_name is resolved client-side
      // from profiles; presence only needs the user id to dedupe.
      void channel.track({ user_id: options.presenceKey });
    }
  });

  return async () => {
    await supabase.removeChannel(channel);
  };
}
