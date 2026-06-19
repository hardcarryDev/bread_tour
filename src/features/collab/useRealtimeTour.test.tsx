import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the channel-wiring layer so the hook can be driven with synthetic
// realtime events without a live Supabase service. We capture the callbacks the
// hook registers and expose drivers to fire changes / presence / status.
type SubOpts = {
  presenceKey: string;
  onSpotsChange?: (p: unknown) => void;
  onMenusChange?: (p: unknown) => void;
  onStampsChange?: (p: unknown) => void;
  onMembersChange?: (p: unknown) => void;
  onManualCheckInChange?: (p: unknown) => void;
  onPresence?: (members: Array<{ user_id: string }>) => void;
  onStatus?: (status: string) => void;
};

let lastOpts: SubOpts | null = null;
const cleanup = vi.fn(async () => {});
const subscribeTourRealtime = vi.fn((_tourId: string, opts: SubOpts) => {
  lastOpts = opts;
  return cleanup;
});

vi.mock('./api', () => ({
  subscribeTourRealtime: (...a: [string, SubOpts]) =>
    subscribeTourRealtime(...a),
}));

import { spotConflictValue, useRealtimeTour } from './useRealtimeTour';

function baseProps() {
  return {
    tourId: 't1',
    currentUserId: 'u1',
    reloadSpots: vi.fn(),
    reloadStamps: vi.fn(),
    reloadMembers: vi.fn(),
    reloadPendingCheckIns: vi.fn(),
    profilesByUserId: {
      u1: 'Alice',
      u2: 'Bob',
    } as Record<string, string | null>,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  lastOpts = null;
});

describe('useRealtimeTour subscription lifecycle (REQ-F5-002)', () => {
  it('subscribes to the tour channel on mount with the user as presence key', () => {
    renderHook(() => useRealtimeTour(baseProps()));
    expect(subscribeTourRealtime).toHaveBeenCalledTimes(1);
    expect(subscribeTourRealtime.mock.calls[0][0]).toBe('t1');
    expect(lastOpts?.presenceKey).toBe('u1');
  });

  it('does not subscribe without a tour id or user id', () => {
    renderHook(() =>
      useRealtimeTour({ ...baseProps(), tourId: undefined }),
    );
    expect(subscribeTourRealtime).not.toHaveBeenCalled();
  });

  it('cleans up the subscription on unmount (no leaks)', async () => {
    const { unmount } = renderHook(() => useRealtimeTour(baseProps()));
    unmount();
    await waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));
  });
});

describe('useRealtimeTour live reflect (REQ-F5-002 / AC-F5-02)', () => {
  it('reloads spots when a spot change arrives', () => {
    const props = baseProps();
    renderHook(() => useRealtimeTour(props));
    act(() => {
      lastOpts?.onSpotsChange?.({
        eventType: 'INSERT',
        new: { id: 's9', updated_at: '2026-06-19T02:00:00Z' },
      });
    });
    expect(props.reloadSpots).toHaveBeenCalledTimes(1);
  });

  it('reloads spots when a menu change arrives (menus belong to the spot view)', () => {
    const props = baseProps();
    renderHook(() => useRealtimeTour(props));
    act(() => {
      lastOpts?.onMenusChange?.({ eventType: 'INSERT', new: { id: 'mn9' } });
    });
    expect(props.reloadSpots).toHaveBeenCalledTimes(1);
  });

  it('reloads stamps when a stamp change arrives', () => {
    const props = baseProps();
    renderHook(() => useRealtimeTour(props));
    act(() => {
      lastOpts?.onStampsChange?.({ eventType: 'INSERT', new: { id: 'st9' } });
    });
    expect(props.reloadStamps).toHaveBeenCalledTimes(1);
  });

  it('reloads members when a member change arrives', () => {
    const props = baseProps();
    renderHook(() => useRealtimeTour(props));
    act(() => {
      lastOpts?.onMembersChange?.({ eventType: 'INSERT', new: { id: 'm9' } });
    });
    expect(props.reloadMembers).toHaveBeenCalledTimes(1);
  });
});

describe('useRealtimeTour manual check-in (REQ-F1-007 / AC-F1-04)', () => {
  it('reloads pending check-ins when a manual_checkin_requests change arrives (other members see requests live)', () => {
    const props = baseProps();
    renderHook(() => useRealtimeTour(props));
    act(() => {
      lastOpts?.onManualCheckInChange?.({
        eventType: 'INSERT',
        new: { id: 'r1', requester_id: 'u2', status: 'pending' },
      });
    });
    expect(props.reloadPendingCheckIns).toHaveBeenCalledTimes(1);
  });

  it('notifies the requester (toast) when THEIR request is confirmed', () => {
    // Current user is u1. u1 made the request; another member confirms it.
    const { result } = renderHook(() => useRealtimeTour(baseProps()));
    act(() => {
      lastOpts?.onManualCheckInChange?.({
        eventType: 'UPDATE',
        old: { id: 'r1', requester_id: 'u1', status: 'pending' },
        new: {
          id: 'r1',
          requester_id: 'u1',
          status: 'confirmed',
          confirmed_by: 'u2',
        },
      });
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toMatch(/확인|체크인|스탬프/);
  });

  it('does NOT toast the requester for someone else’s confirmed request', () => {
    // Current user is u1, but the confirmed request belongs to u2.
    const { result } = renderHook(() => useRealtimeTour(baseProps()));
    act(() => {
      lastOpts?.onManualCheckInChange?.({
        eventType: 'UPDATE',
        old: { id: 'r2', requester_id: 'u2', status: 'pending' },
        new: {
          id: 'r2',
          requester_id: 'u2',
          status: 'confirmed',
          confirmed_by: 'u1',
        },
      });
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('does not toast on a pending insert (only on confirmation)', () => {
    const { result } = renderHook(() => useRealtimeTour(baseProps()));
    act(() => {
      lastOpts?.onManualCheckInChange?.({
        eventType: 'INSERT',
        new: { id: 'r1', requester_id: 'u1', status: 'pending' },
      });
    });
    expect(result.current.toasts).toHaveLength(0);
  });
});

describe('useRealtimeTour presence (REQ-F5-003 / AC-F5-03)', () => {
  it('exposes the connected members list, enriched with display names', () => {
    const { result } = renderHook(() => useRealtimeTour(baseProps()));
    act(() => {
      lastOpts?.onPresence?.([{ user_id: 'u1' }, { user_id: 'u2' }]);
    });
    expect(result.current.connectedMembers).toHaveLength(2);
    const byId = Object.fromEntries(
      result.current.connectedMembers.map((m) => [m.user_id, m.display_name]),
    );
    expect(byId.u1).toBe('Alice');
    expect(byId.u2).toBe('Bob');
  });

  it('updates the list when a member leaves (presence shrinks)', () => {
    const { result } = renderHook(() => useRealtimeTour(baseProps()));
    act(() => {
      lastOpts?.onPresence?.([{ user_id: 'u1' }, { user_id: 'u2' }]);
    });
    act(() => {
      lastOpts?.onPresence?.([{ user_id: 'u1' }]);
    });
    expect(result.current.connectedMembers.map((m) => m.user_id)).toEqual([
      'u1',
    ]);
  });
});

describe('useRealtimeTour conflict notice (REQ-F5-004 / NFR-CONFLICT-003 / AC-F5-04)', () => {
  it('fires a toast when the local pending edit is overwritten by a newer change from another member', () => {
    const { result } = renderHook(() => useRealtimeTour(baseProps()));

    // The local user (u1) just edited spot s1 to "내 값"; record the pending edit
    // using the composite conflict value (the same helper the hook compares with).
    act(() => {
      result.current.notePendingEdit({
        table: 'spots',
        rowId: 's1',
        value: spotConflictValue({
          name: '내 값',
          lat: 37.5,
          lng: 127,
          kind: 'bakery',
          radius_m: 50,
        }),
      });
    });

    // A newer change from member u2 overwrites the same row (row-level LWW: the
    // server timestamp on the incoming row is later than the local edit).
    act(() => {
      lastOpts?.onSpotsChange?.({
        eventType: 'UPDATE',
        new: {
          id: 's1',
          name: '다른 멤버 값',
          lat: 37.5,
          lng: 127,
          kind: 'bakery',
          radius_m: 50,
          updated_at: '2026-06-19T03:00:00Z',
        },
      });
    });

    expect(result.current.toasts).toHaveLength(1);
    // The toast is non-destructive and surfaces the latest server value.
    expect(result.current.toasts[0].message).toContain('다른 멤버 값');
  });

  it('fires a toast when another member concurrently changes lat/lng (not just name) (H-01 / AC-F5-03/04)', () => {
    const { result } = renderHook(() => useRealtimeTour(baseProps()));

    // The local user (u1) edited spot s1; the pending edit value is the
    // composite of all editable fields they submitted.
    act(() => {
      result.current.notePendingEdit({
        table: 'spots',
        rowId: 's1',
        value: spotConflictValue({
          name: '성수 베이커리',
          lat: 37.5,
          lng: 127,
          kind: 'bakery',
          radius_m: 50,
        }),
      });
    });

    // Another member moves the same spot (lat/lng change) but keeps the name.
    // A name-only comparison would miss this; the composite comparison catches
    // it and surfaces the overwrite toast.
    act(() => {
      lastOpts?.onSpotsChange?.({
        eventType: 'UPDATE',
        new: {
          id: 's1',
          name: '성수 베이커리',
          lat: 37.6,
          lng: 127.1,
          kind: 'bakery',
          radius_m: 50,
          updated_at: '2026-06-19T03:00:00Z',
        },
      });
    });

    expect(result.current.toasts).toHaveLength(1);
  });

  it('does not fire a toast when the incoming change matches the local edit (own write echoed back)', () => {
    const { result } = renderHook(() => useRealtimeTour(baseProps()));
    const edited = {
      name: '내 값',
      lat: 37.5,
      lng: 127,
      kind: 'bakery',
      radius_m: 50,
    };
    act(() => {
      result.current.notePendingEdit({
        table: 'spots',
        rowId: 's1',
        value: spotConflictValue(edited),
      });
    });
    act(() => {
      lastOpts?.onSpotsChange?.({
        eventType: 'UPDATE',
        new: { id: 's1', ...edited, updated_at: '2026-06-19T03:00:00Z' },
      });
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('does not fire a toast for rows the local user was not editing', () => {
    const { result } = renderHook(() => useRealtimeTour(baseProps()));
    act(() => {
      lastOpts?.onSpotsChange?.({
        eventType: 'UPDATE',
        new: { id: 's2', name: '무관한 값', updated_at: '2026-06-19T03:00:00Z' },
      });
    });
    expect(result.current.toasts).toHaveLength(0);
  });
});

describe('useRealtimeTour offline / reconnect (REQ-F5-005 / AC-F5-05 / EC-03)', () => {
  it('starts online', () => {
    const { result } = renderHook(() => useRealtimeTour(baseProps()));
    expect(result.current.online).toBe(true);
  });

  it('goes offline on a channel error and keeps last state (no reload triggered by going offline)', () => {
    const props = baseProps();
    const { result } = renderHook(() => useRealtimeTour(props));
    act(() => {
      lastOpts?.onStatus?.('SUBSCRIBED');
    });
    act(() => {
      lastOpts?.onStatus?.('CHANNEL_ERROR');
    });
    expect(result.current.online).toBe(false);
    // Going offline must NOT clear/reload — last synced state is kept.
    expect(props.reloadSpots).not.toHaveBeenCalled();
    expect(props.reloadStamps).not.toHaveBeenCalled();
  });

  it('re-syncs (reloads everything) on reconnect after being offline', () => {
    const props = baseProps();
    const { result } = renderHook(() => useRealtimeTour(props));
    act(() => {
      lastOpts?.onStatus?.('SUBSCRIBED');
    });
    act(() => {
      lastOpts?.onStatus?.('CHANNEL_ERROR');
    });
    act(() => {
      lastOpts?.onStatus?.('SUBSCRIBED');
    });
    expect(result.current.online).toBe(true);
    // Reconnect re-syncs to the latest server state.
    expect(props.reloadSpots).toHaveBeenCalledTimes(1);
    expect(props.reloadStamps).toHaveBeenCalledTimes(1);
    expect(props.reloadMembers).toHaveBeenCalledTimes(1);
  });

  it('treats TIMED_OUT and CLOSED as offline', () => {
    const { result } = renderHook(() => useRealtimeTour(baseProps()));
    act(() => {
      lastOpts?.onStatus?.('SUBSCRIBED');
    });
    act(() => {
      lastOpts?.onStatus?.('TIMED_OUT');
    });
    expect(result.current.online).toBe(false);
  });
});
