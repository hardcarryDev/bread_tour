import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the shared Supabase client BEFORE importing the API under test.
vi.mock('../../lib/supabase', () => {
  return { supabase: { from: vi.fn(), rpc: vi.fn() } };
});

import { supabase } from '../../lib/supabase';
import {
  addSpot,
  addSpotKind,
  deleteSpot,
  listSpotKinds,
  listSpots,
  reorderSpots,
  updateSpot,
} from './api';

// A minimal chainable PostgREST query-builder mock. Each terminal call
// (single / maybeSingle / awaited select / etc.) resolves to `result`.
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listSpots (REQ-F3-001 / AC-F3-01)', () => {
  it('selects the tour spots ordered by order_index ascending', async () => {
    const spots = [
      { id: 's1', tour_id: 't1', name: 'A', order_index: 1, lat: 1, lng: 2 },
      { id: 's2', tour_id: 't1', name: 'B', order_index: 2, lat: 3, lng: 4 },
    ];
    const b = builder({ data: spots, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await listSpots('t1');

    expect(mockedFrom).toHaveBeenCalledWith('spots');
    expect(b.eq).toHaveBeenCalledWith('tour_id', 't1');
    expect(b.order).toHaveBeenCalledWith('order_index', { ascending: true });
    expect(result).toEqual(spots);
  });

  it('throws when supabase returns an error', async () => {
    const b = builder({ data: null, error: { message: 'denied' } });
    mockedFrom.mockReturnValue(b);
    await expect(listSpots('t1')).rejects.toThrow('denied');
  });
});

describe('addSpot (REQ-F1-001 / AC-F1-06)', () => {
  it('stores lat/lng and a default radius of 50, appended at the next order_index', async () => {
    const created = {
      id: 's3',
      tour_id: 't1',
      name: 'New Bakery',
      kind: 'bakery',
      lat: 37.5,
      lng: 127.0,
      radius_m: 50,
      order_index: 3,
    };
    const b = builder({ data: created, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await addSpot({
      tourId: 't1',
      name: 'New Bakery',
      lat: 37.5,
      lng: 127.0,
      kind: 'bakery',
      existingCount: 2,
    });

    expect(mockedFrom).toHaveBeenCalledWith('spots');
    expect(b.insert).toHaveBeenCalledWith({
      tour_id: 't1',
      name: 'New Bakery',
      kind: 'bakery',
      lat: 37.5,
      lng: 127.0,
      radius_m: 50,
      order_index: 3,
    });
    expect(result).toEqual(created);
  });

  it('allows an explicit radius override', async () => {
    const b = builder({ data: { id: 's4' }, error: null });
    mockedFrom.mockReturnValue(b);

    await addSpot({
      tourId: 't1',
      name: 'Far Spot',
      lat: 1,
      lng: 2,
      radiusM: 120,
      existingCount: 0,
    });

    expect(b.insert).toHaveBeenCalledWith(
      expect.objectContaining({ radius_m: 120, order_index: 1 }),
    );
  });

  it('defaults kind to 빵집 when not provided', async () => {
    const b = builder({ data: { id: 's5' }, error: null });
    mockedFrom.mockReturnValue(b);
    await addSpot({ tourId: 't1', name: 'x', lat: 1, lng: 2, existingCount: 0 });
    expect(b.insert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: '빵집' }),
    );
  });
});

describe('spot_kinds (per-tour 종류 list / 종류 추가)', () => {
  it('lists a tour kind names in creation order', async () => {
    const b = builder({
      data: [{ name: '빵집' }, { name: '음식점' }, { name: '카페' }],
      error: null,
    });
    mockedFrom.mockReturnValue(b);

    const result = await listSpotKinds('t1');

    expect(mockedFrom).toHaveBeenCalledWith('spot_kinds');
    expect(b.eq).toHaveBeenCalledWith('tour_id', 't1');
    expect(b.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(result).toEqual(['빵집', '음식점', '카페']);
  });

  it('inserts a trimmed new kind and returns it', async () => {
    const b = builder({ data: null, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await addSpotKind('t1', '  카페  ');

    expect(b.insert).toHaveBeenCalledWith({ tour_id: 't1', name: '카페' });
    expect(result).toBe('카페');
  });

  it('treats a duplicate (unique violation 23505) as success', async () => {
    const b = builder({ data: null, error: { code: '23505', message: 'dup' } });
    mockedFrom.mockReturnValue(b);

    await expect(addSpotKind('t1', '빵집')).resolves.toBe('빵집');
  });

  it('throws on a non-duplicate insert error', async () => {
    const b = builder({ data: null, error: { code: '42501', message: 'denied' } });
    mockedFrom.mockReturnValue(b);

    await expect(addSpotKind('t1', '카페')).rejects.toThrow('denied');
  });
});

describe('updateSpot (REQ-F4-001 edit)', () => {
  it('updates the spot fields by id and returns the row', async () => {
    const updated = { id: 's1', name: 'Renamed' };
    const b = builder({ data: updated, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await updateSpot('s1', { name: 'Renamed' });

    expect(mockedFrom).toHaveBeenCalledWith('spots');
    expect(b.update).toHaveBeenCalledWith({ name: 'Renamed' });
    expect(b.eq).toHaveBeenCalledWith('id', 's1');
    expect(result).toEqual(updated);
  });
});

describe('deleteSpot (owner only via RLS, REQ-F6-007)', () => {
  it('deletes the spot row by id', async () => {
    const b = builder({ data: null, error: null });
    mockedFrom.mockReturnValue(b);
    await deleteSpot('s1');
    expect(mockedFrom).toHaveBeenCalledWith('spots');
    expect(b.delete).toHaveBeenCalled();
    expect(b.eq).toHaveBeenCalledWith('id', 's1');
  });

  it('throws when RLS denies the delete (non-owner)', async () => {
    const b = builder({ data: null, error: { message: 'forbidden' } });
    mockedFrom.mockReturnValue(b);
    await expect(deleteSpot('s1')).rejects.toThrow('forbidden');
  });
});

describe('reorderSpots (REQ-F5-007 / AC-F5-06)', () => {
  it('calls the reorder_spots RPC with the tour id and ordered id array', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: null });

    await reorderSpots('t1', ['s2', 's1', 's3']);

    expect(mockedRpc).toHaveBeenCalledWith('reorder_spots', {
      p_tour_id: 't1',
      p_ordered_ids: ['s2', 's1', 's3'],
    });
  });

  it('throws when the RPC returns an error', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: { message: 'mismatch' } });
    await expect(reorderSpots('t1', ['s1'])).rejects.toThrow('mismatch');
  });
});
