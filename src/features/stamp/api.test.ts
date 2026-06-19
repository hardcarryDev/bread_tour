import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the shared Supabase client BEFORE importing the API under test.
vi.mock('../../lib/supabase', () => {
  return { supabase: { from: vi.fn(), rpc: vi.fn() } };
});

import { supabase } from '../../lib/supabase';
import {
  cancelManualCheckIn,
  cancelStamp,
  confirmManualCheckIn,
  correctStampArrival,
  createStamp,
  listPendingCheckIns,
  listStamps,
  requestManualCheckIn,
  stampMapBySpot,
} from './api';
import type { ManualCheckInRequest, Stamp } from '../../types/database';

// A minimal chainable PostgREST query-builder mock (mirrors map/api.test.ts).
function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'is'];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  (chain as unknown as { then: PromiseLike<unknown>['then'] }).then = (
    onfulfilled,
    onrejected,
  ) => Promise.resolve(result).then(onfulfilled, onrejected);
  return chain;
}

const mockedFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
const mockedRpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

function checkInRow(
  partial: Partial<ManualCheckInRequest> & Pick<ManualCheckInRequest, 'id'>,
): ManualCheckInRequest {
  return {
    spot_id: 's1',
    tour_id: 't1',
    requester_id: 'u1',
    status: 'pending',
    confirmed_by: null,
    stamp_id: null,
    created_at: 'x',
    updated_at: 'x',
    ...partial,
  } as ManualCheckInRequest;
}

function stampRow(partial: Partial<Stamp> & Pick<Stamp, 'id'>): Stamp {
  return {
    spot_id: 's1',
    tour_id: 't1',
    user_id: 'u1',
    method: 'auto',
    arrived_at: '2026-06-19T00:00:00Z',
    cancelled_at: null,
    created_at: 'x',
    updated_at: 'x',
    ...partial,
  } as Stamp;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createStamp (REQ-F1-002/003 — server time as arrival source)', () => {
  it('inserts spot_id + user_id + method WITHOUT a client arrived_at (A6)', async () => {
    const created = stampRow({ id: 'st1' });
    const b = builder({ data: created, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await createStamp({ spotId: 's1', userId: 'u1' });

    expect(mockedFrom).toHaveBeenCalledWith('stamps');
    const payload = b.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toEqual({ spot_id: 's1', user_id: 'u1', method: 'auto' });
    // Client time MUST NOT be sent — arrived_at comes from the DB default.
    expect(payload).not.toHaveProperty('arrived_at');
    expect(result).toEqual(created);
  });

  it('does not award a duplicate while a valid stamp exists (REQ-F1-004 / AC-F1-02)', async () => {
    // Partial-unique-index violation surfaces as a unique-constraint error.
    const b = builder({
      data: null,
      error: { message: 'duplicate key value violates unique constraint' },
    });
    mockedFrom.mockReturnValue(b);
    await expect(createStamp({ spotId: 's1', userId: 'u1' })).rejects.toThrow(
      /duplicate/,
    );
  });
});

describe('listStamps + stampMapBySpot (REQ-F1-005 / AC-F1-07)', () => {
  it('lists only valid (non-cancelled) stamps for the tour', async () => {
    const rows = [stampRow({ id: 'st1', spot_id: 's1' })];
    const b = builder({ data: rows, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await listStamps('t1');

    expect(mockedFrom).toHaveBeenCalledWith('stamps');
    expect(b.eq).toHaveBeenCalledWith('tour_id', 't1');
    // Valid stamps only: cancelled_at IS NULL.
    expect(b.is).toHaveBeenCalledWith('cancelled_at', null);
    expect(result).toEqual(rows);
  });

  it('builds a spot_id -> {stamped, arrivedAt} map for MapView/progress', () => {
    const rows = [
      stampRow({ id: 'st1', spot_id: 's1', arrived_at: '2026-06-19T01:00:00Z' }),
    ];
    const map = stampMapBySpot(rows);
    expect(map.s1).toEqual({
      stamped: true,
      arrivedAt: '2026-06-19T01:00:00Z',
      stampId: 'st1',
      userId: 'u1',
    });
    expect(map.s2).toBeUndefined();
  });
});

describe('cancelStamp (REQ-F1-009 — soft cancel, permission via RLS)', () => {
  it('sets cancelled_at instead of deleting the row (preserves history)', async () => {
    const b = builder({ data: stampRow({ id: 'st1' }), error: null });
    mockedFrom.mockReturnValue(b);

    await cancelStamp('st1');

    expect(mockedFrom).toHaveBeenCalledWith('stamps');
    const patch = b.update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).toHaveProperty('cancelled_at');
    expect(patch.cancelled_at).not.toBeNull();
    expect(b.eq).toHaveBeenCalledWith('id', 'st1');
  });

  it('throws when RLS denies the cancel (unpermitted member, REQ-F1-010 / AC-F1-09)', async () => {
    const b = builder({ data: null, error: { message: 'forbidden' } });
    mockedFrom.mockReturnValue(b);
    await expect(cancelStamp('st1')).rejects.toThrow('forbidden');
  });
});

describe('correctStampArrival (REQ-F1-009 — correct arrival time)', () => {
  it('updates arrived_at to the provided corrected timestamp', async () => {
    const b = builder({ data: stampRow({ id: 'st1' }), error: null });
    mockedFrom.mockReturnValue(b);

    await correctStampArrival('st1', '2026-06-19T02:00:00Z');

    expect(b.update).toHaveBeenCalledWith({
      arrived_at: '2026-06-19T02:00:00Z',
    });
    expect(b.eq).toHaveBeenCalledWith('id', 'st1');
  });
});

// M-01: there is no direct manualCheckIn() export. The only sanctioned manual
// path is requestManualCheckIn -> confirmManualCheckIn (RPC), covered below and
// in the manual_checkin_requests RLS / RPC migration. A direct manual-stamp
// INSERT would bypass the peer-confirmation requirement (AC-F1-04), so the
// function is intentionally absent.

describe('requestManualCheckIn (REQ-F1-007 / AC-F1-04 — request, not yet a stamp)', () => {
  it('inserts a PENDING request into manual_checkin_requests (no stamp created)', async () => {
    const created = checkInRow({ id: 'r1' });
    const b = builder({ data: created, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await requestManualCheckIn({ spotId: 's1', userId: 'u1' });

    // A request must NOT touch the stamps table — confirmation creates the stamp.
    expect(mockedFrom).toHaveBeenCalledWith('manual_checkin_requests');
    expect(mockedFrom).not.toHaveBeenCalledWith('stamps');
    const payload = b.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      spot_id: 's1',
      requester_id: 'u1',
      status: 'pending',
    });
    // No confirmation fields, no client timestamps on insert.
    expect(payload).not.toHaveProperty('confirmed_by');
    expect(payload).not.toHaveProperty('stamp_id');
    expect(payload).not.toHaveProperty('tour_id'); // set by trigger from spot
    expect(result).toEqual(created);
  });

  it('throws when RLS denies the request', async () => {
    const b = builder({ data: null, error: { message: 'forbidden' } });
    mockedFrom.mockReturnValue(b);
    await expect(
      requestManualCheckIn({ spotId: 's1', userId: 'u1' }),
    ).rejects.toThrow('forbidden');
  });
});

describe('listPendingCheckIns (REQ-F1-007 — other members see live requests)', () => {
  it('lists only PENDING requests for the tour', async () => {
    const rows = [checkInRow({ id: 'r1' })];
    const b = builder({ data: rows, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await listPendingCheckIns('t1');

    expect(mockedFrom).toHaveBeenCalledWith('manual_checkin_requests');
    expect(b.eq).toHaveBeenCalledWith('tour_id', 't1');
    expect(b.eq).toHaveBeenCalledWith('status', 'pending');
    expect(result).toEqual(rows);
  });
});

describe('confirmManualCheckIn (REQ-F1-007 / AC-F1-04 — peer confirm creates the stamp)', () => {
  it('rejects self-confirmation client-side without calling the server', async () => {
    await expect(
      confirmManualCheckIn({ requestId: 'r1', confirmerId: 'u1', requesterId: 'u1' }),
    ).rejects.toThrow(/another member/i);
    expect(mockedRpc).not.toHaveBeenCalled();
  });

  it('calls the confirm_manual_checkin RPC (server creates the manual stamp with server time)', async () => {
    // The RPC returns the new stamp id; the stamp is created server-side with
    // arrived_at = now() (A6) — the client never sends a timestamp.
    mockedRpc.mockResolvedValue({ data: 'st-manual-1', error: null });

    const stampId = await confirmManualCheckIn({
      requestId: 'r1',
      confirmerId: 'u2',
      requesterId: 'u1',
    });

    expect(mockedRpc).toHaveBeenCalledWith('confirm_manual_checkin', {
      p_request_id: 'r1',
    });
    expect(stampId).toBe('st-manual-1');
  });

  it('surfaces the RLS/RPC denial when the confirmer is the requester (server guard)', async () => {
    // Even if the client guard were bypassed, the RPC enforces confirmer != requester.
    mockedRpc.mockResolvedValue({
      data: null,
      error: { message: 'a manual check-in must be confirmed by another member' },
    });
    await expect(
      confirmManualCheckIn({
        requestId: 'r1',
        confirmerId: 'u2',
        requesterId: 'u1',
      }),
    ).rejects.toThrow(/another member/i);
  });
});

describe('cancelManualCheckIn (REQ-F1-007 — withdraw a pending request)', () => {
  it('marks the request cancelled (status=cancelled), not a stamp change', async () => {
    const b = builder({ data: checkInRow({ id: 'r1' }), error: null });
    mockedFrom.mockReturnValue(b);

    await cancelManualCheckIn('r1');

    expect(mockedFrom).toHaveBeenCalledWith('manual_checkin_requests');
    expect(mockedFrom).not.toHaveBeenCalledWith('stamps');
    const patch = b.update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).toEqual({ status: 'cancelled' });
    expect(b.eq).toHaveBeenCalledWith('id', 'r1');
  });

  it('throws when RLS denies the cancel', async () => {
    const b = builder({ data: null, error: { message: 'forbidden' } });
    mockedFrom.mockReturnValue(b);
    await expect(cancelManualCheckIn('r1')).rejects.toThrow('forbidden');
  });
});
