// Realtime collaboration hook (SPEC-BREADTOUR-001 / F5).
//
// Subscribes one tour-scoped Supabase Realtime channel and turns its events into
// the live behaviours Slice D requires:
//   - live reflect (REQ-F5-002 / AC-F5-02): any spot/menu/stamp/member row change
//     triggers the existing reload() of the affected view, so other members' edits
//     appear without a manual refresh. We reload rather than patch rows so the
//     server stays the single source of truth (row-level last-write-wins).
//   - presence (REQ-F5-003 / AC-F5-03): expose the connected-member list, enriched
//     with display names resolved client-side from profiles.
//   - conflict notice (REQ-F5-004 / NFR-CONFLICT-003 / AC-F5-04): when an incoming
//     row UPDATE overwrites a value the local user had pending (and the server's
//     latest differs from what they sent), surface a NON-destructive toast with
//     the latest value. LWW ordering is the server updated_at on the incoming
//     row; we never send client time.
//   - offline / reconnect (REQ-F5-005 / AC-F5-05 / EC-03): a channel error/timeout
//     flips `online` to false but keeps last state (no reload, no clear); a fresh
//     SUBSCRIBED after being offline re-runs every reload() to re-sync.
//
// All state is local to the hook; the subscription is torn down on unmount.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  subscribeTourRealtime,
  type PresenceMember,
  type RealtimeChange,
} from './api';
import { useToasts, type Toast } from './useToasts';

// A pending local edit the user made but has not seen echoed/confirmed yet.
export interface PendingEdit {
  table: string;
  rowId: string;
  // The value the local user submitted (compared against the incoming row).
  value: string;
}

export interface UseRealtimeTourOptions {
  tourId: string | undefined;
  currentUserId: string | undefined;
  reloadSpots: () => void;
  reloadStamps: () => void;
  reloadMembers: () => void;
  // Reload the tour's pending manual check-in requests so other members see a
  // new/withdrawn request live (REQ-F1-007). Optional so existing callers that
  // do not use manual check-in keep working.
  reloadPendingCheckIns?: () => void;
  // user_id -> display_name, used to label presence entries (REQ-F5-003).
  profilesByUserId?: Record<string, string | null>;
}

export interface UseRealtimeTourResult {
  connectedMembers: PresenceMember[];
  online: boolean;
  toasts: Toast[];
  dismissToast: (id: string) => void;
  // Register a value the local user just submitted so an overwriting change can
  // be detected (REQ-F5-004). Cleared once the matching row echoes back.
  notePendingEdit: (edit: PendingEdit) => void;
}

// Connection statuses that mean "not live". Anything else with SUBSCRIBED is live.
const OFFLINE_STATUSES = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

// Build the comparable conflict value for a spot from ALL of its editable
// fields, not just the name. A name-only comparison silently drops concurrent
// edits to lat/lng/kind/radius_m (H-01 / AC-F5-03/04): if another member moved
// the spot but kept the name, the conflict would go unnoticed. Callers
// recording a pending local edit MUST build their value with this same helper
// so the local and incoming values are comparable.
export function spotConflictValue(row: {
  name?: unknown;
  lat?: unknown;
  lng?: unknown;
  kind?: unknown;
  radius_m?: unknown;
}): string {
  return [
    `name=${String(row.name ?? '')}`,
    `lat=${String(row.lat ?? '')}`,
    `lng=${String(row.lng ?? '')}`,
    `kind=${String(row.kind ?? '')}`,
    `radius=${String(row.radius_m ?? '')}`,
  ].join('|');
}

// Pull a comparable string value out of an incoming row for the given table.
// For spots we compare a composite of every editable field (H-01); menus use
// menu_text. Fallback to a stringified row so unknown tables still compare
// deterministically.
function rowValue(table: string, row: Record<string, unknown> | null | undefined): string {
  if (!row) return '';
  if (table === 'spots') return spotConflictValue(row);
  if (table === 'spot_menus') return String(row.menu_text ?? '');
  return JSON.stringify(row);
}

export function useRealtimeTour(
  options: UseRealtimeTourOptions,
): UseRealtimeTourResult {
  const {
    tourId,
    currentUserId,
    reloadSpots,
    reloadStamps,
    reloadMembers,
    reloadPendingCheckIns,
    profilesByUserId,
  } = options;

  const [connectedMembers, setConnectedMembers] = useState<PresenceMember[]>([]);
  const [online, setOnline] = useState(true);
  const { toasts, push, dismiss } = useToasts();

  // Refs so the channel callbacks (registered once) always read the latest props
  // without re-subscribing.
  const reloadSpotsRef = useRef(reloadSpots);
  const reloadStampsRef = useRef(reloadStamps);
  const reloadMembersRef = useRef(reloadMembers);
  const reloadPendingCheckInsRef = useRef(reloadPendingCheckIns);
  const profilesRef = useRef(profilesByUserId);
  const pushRef = useRef(push);
  const currentUserIdRef = useRef(currentUserId);
  const wasOfflineRef = useRef(false);
  const pendingEditsRef = useRef<Map<string, PendingEdit>>(new Map());

  reloadSpotsRef.current = reloadSpots;
  reloadStampsRef.current = reloadStamps;
  reloadMembersRef.current = reloadMembers;
  reloadPendingCheckInsRef.current = reloadPendingCheckIns;
  profilesRef.current = profilesByUserId;
  pushRef.current = push;
  currentUserIdRef.current = currentUserId;

  const editKey = (table: string, rowId: string) => `${table}:${rowId}`;

  const notePendingEdit = useCallback((edit: PendingEdit) => {
    pendingEditsRef.current.set(editKey(edit.table, edit.rowId), edit);
  }, []);

  // Compare an incoming row change against any pending local edit for the same
  // row. If the latest server value differs from what the local user submitted,
  // their unsynced change was overwritten (row-level LWW) -> non-destructive toast.
  const checkConflict = useCallback((table: string, change: RealtimeChange) => {
    if (change.eventType !== 'UPDATE') return;
    const row = change.new;
    const rowId = row && typeof row.id === 'string' ? row.id : undefined;
    if (!rowId) return;
    const key = editKey(table, rowId);
    const pending = pendingEditsRef.current.get(key);
    if (!pending) return;

    const incoming = rowValue(table, row);
    if (incoming === pending.value) {
      // Our own write echoed back (or someone set the same value) — no conflict.
      pendingEditsRef.current.delete(key);
      return;
    }
    // Overwritten by a newer change with a different value.
    pendingEditsRef.current.delete(key);
    pushRef.current(
      `다른 멤버의 변경으로 갱신되었습니다. 최신 값: "${incoming}"`,
    );
  }, []);

  // Handle a manual check-in request change (REQ-F1-007 / AC-F1-04):
  //   - always reload the pending list so other members see new/withdrawn
  //     requests live;
  //   - when a request transitions to 'confirmed' AND it belongs to the local
  //     user, notify them with a non-destructive toast (their check-in was
  //     confirmed by another member and a stamp now exists).
  const handleManualCheckInChange = useCallback((change: RealtimeChange) => {
    reloadPendingCheckInsRef.current?.();
    if (change.eventType !== 'UPDATE') return;
    const row = change.new;
    if (!row || row.status !== 'confirmed') return;
    const wasPending =
      !change.old || (change.old as Record<string, unknown>).status !== 'confirmed';
    if (!wasPending) return;
    if (row.requester_id === currentUserIdRef.current) {
      pushRef.current('수동 체크인이 다른 멤버에게 확인되어 스탬프가 적용되었습니다.');
      // The new stamp is now visible to the requester — refresh the board.
      reloadStampsRef.current();
    }
  }, []);

  useEffect(() => {
    if (!tourId || !currentUserId) return;

    const cleanup = subscribeTourRealtime(tourId, {
      presenceKey: currentUserId,
      onSpotsChange: (change) => {
        checkConflict('spots', change);
        reloadSpotsRef.current();
      },
      onMenusChange: (change) => {
        checkConflict('spot_menus', change);
        // Menus are part of the spot view; one reload refreshes both.
        reloadSpotsRef.current();
      },
      onStampsChange: () => reloadStampsRef.current(),
      onMembersChange: () => reloadMembersRef.current(),
      onManualCheckInChange: handleManualCheckInChange,
      onPresence: (members) => {
        const enriched = members.map((m) => ({
          user_id: m.user_id,
          display_name:
            m.display_name ?? profilesRef.current?.[m.user_id] ?? null,
        }));
        setConnectedMembers(enriched);
      },
      onStatus: (status) => {
        if (status === 'SUBSCRIBED') {
          setOnline(true);
          // Re-sync to the latest server state on reconnect (REQ-F5-005).
          if (wasOfflineRef.current) {
            wasOfflineRef.current = false;
            reloadSpotsRef.current();
            reloadStampsRef.current();
            reloadMembersRef.current();
          }
        } else if (OFFLINE_STATUSES.has(status)) {
          // Keep last state; just flag offline (do NOT reload/clear — EC-03).
          wasOfflineRef.current = true;
          setOnline(false);
        }
      },
    });

    return () => {
      void cleanup();
    };
    // checkConflict/handleManualCheckInChange/notePendingEdit are stable
    // (useCallback). Re-subscribe only when the tour or user identity changes.
  }, [tourId, currentUserId, checkConflict, handleManualCheckInChange]);

  return {
    connectedMembers,
    online,
    toasts,
    dismissToast: dismiss,
    notePendingEdit,
  };
}
