import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the shared Supabase client BEFORE importing the API under test.
vi.mock('../../lib/supabase', () => {
  return { supabase: { from: vi.fn() } };
});

import { supabase } from '../../lib/supabase';
import {
  deleteSettlement,
  listSettlements,
  upsertSettlement,
} from './api';
import type { SpotSettlement } from '../../types/database';

// A minimal chainable PostgREST query-builder mock (mirrors stamp/api.test.ts).
function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ['select', 'insert', 'update', 'upsert', 'delete', 'eq'];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(result));
  (chain as unknown as { then: PromiseLike<unknown>['then'] }).then = (
    onfulfilled,
    onrejected,
  ) => Promise.resolve(result).then(onfulfilled, onrejected);
  return chain;
}

const mockedFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;

function settlementRow(
  partial: Partial<SpotSettlement> & Pick<SpotSettlement, 'id'>,
): SpotSettlement {
  return {
    spot_id: 's1',
    tour_id: 't1',
    amount: 12000,
    payer_ids: ['u1'],
    participant_ids: ['u1', 'u2'],
    created_by: 'u1',
    created_at: 'x',
    updated_at: 'x',
    ...partial,
  } as SpotSettlement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listSettlements', () => {
  it('selects all settlements for the tour', async () => {
    const rows = [settlementRow({ id: 'se1' })];
    const b = builder({ data: rows, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await listSettlements('t1');

    expect(mockedFrom).toHaveBeenCalledWith('spot_settlements');
    expect(b.eq).toHaveBeenCalledWith('tour_id', 't1');
    expect(result).toEqual(rows);
  });

  it('returns [] when there are no rows', async () => {
    const b = builder({ data: null, error: null });
    mockedFrom.mockReturnValue(b);
    expect(await listSettlements('t1')).toEqual([]);
  });

  it('throws when RLS/select fails', async () => {
    const b = builder({ data: null, error: { message: 'forbidden' } });
    mockedFrom.mockReturnValue(b);
    await expect(listSettlements('t1')).rejects.toThrow('forbidden');
  });
});

describe('upsertSettlement (one row per spot, onConflict spot_id)', () => {
  it('upserts the settlement payload keyed on spot_id', async () => {
    const created = settlementRow({ id: 'se1' });
    const b = builder({ data: created, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await upsertSettlement({
      spotId: 's1',
      tourId: 't1',
      amount: 12000,
      payerIds: ['u1'],
      participantIds: ['u1', 'u2'],
      userId: 'u1',
    });

    expect(mockedFrom).toHaveBeenCalledWith('spot_settlements');
    const payload = b.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toEqual({
      spot_id: 's1',
      tour_id: 't1',
      amount: 12000,
      payer_ids: ['u1'],
      participant_ids: ['u1', 'u2'],
      created_by: 'u1',
    });
    const options = b.upsert.mock.calls[0][1] as Record<string, unknown>;
    expect(options).toEqual({ onConflict: 'spot_id' });
    expect(result).toEqual(created);
  });

  it('throws when RLS denies the upsert', async () => {
    const b = builder({ data: null, error: { message: 'forbidden' } });
    mockedFrom.mockReturnValue(b);
    await expect(
      upsertSettlement({
        spotId: 's1',
        tourId: 't1',
        amount: 12000,
        payerIds: ['u1'],
        participantIds: ['u1'],
        userId: 'u1',
      }),
    ).rejects.toThrow('forbidden');
  });
});

describe('deleteSettlement', () => {
  it('deletes the settlement by spot_id', async () => {
    const b = builder({ data: null, error: null });
    mockedFrom.mockReturnValue(b);

    await deleteSettlement('s1');

    expect(mockedFrom).toHaveBeenCalledWith('spot_settlements');
    expect(b.delete).toHaveBeenCalled();
    expect(b.eq).toHaveBeenCalledWith('spot_id', 's1');
  });

  it('throws when RLS denies the delete', async () => {
    const b = builder({ data: null, error: { message: 'forbidden' } });
    mockedFrom.mockReturnValue(b);
    await expect(deleteSettlement('s1')).rejects.toThrow('forbidden');
  });
});
