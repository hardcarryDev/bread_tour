import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the shared Supabase client BEFORE importing the API under test.
vi.mock('../../lib/supabase', () => {
  return { supabase: { from: vi.fn(), rpc: vi.fn() } };
});

import { supabase } from '../../lib/supabase';
import {
  acceptInvite,
  createInvite,
  createTour,
  deleteTour,
  getMyRole,
  getTour,
  inviteLinkFor,
  listMembers,
  listMyTours,
  rejectInvite,
  removeMember,
} from './api';

// A minimal chainable PostgREST query-builder mock. Each terminal call
// (single / maybeSingle / awaited select / etc.) resolves to `result`.
function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'order',
    'is',
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // Terminal resolvers.
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  // Make the chain itself awaitable (for `await supabase.from(..).select()`).
  (chain as unknown as { then: PromiseLike<unknown>['then'] }).then = (
    onfulfilled,
    onrejected,
  ) => Promise.resolve(result).then(onfulfilled, onrejected);
  return chain;
}

const mockedFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createTour (REQ-F6-001 / AC-F6-01)', () => {
  it('inserts a tour with the creator as owner_id and returns the row', async () => {
    const tour = {
      id: 't1',
      owner_id: 'u1',
      name: 'Seoul Bakeries',
      created_at: 'x',
      updated_at: 'x',
    };
    const b = builder({ data: tour, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await createTour({ name: 'Seoul Bakeries', userId: 'u1' });

    expect(mockedFrom).toHaveBeenCalledWith('tours');
    expect(b.insert).toHaveBeenCalledWith({
      name: 'Seoul Bakeries',
      owner_id: 'u1',
    });
    expect(result).toEqual(tour);
  });

  it('throws when supabase returns an error', async () => {
    const b = builder({ data: null, error: { message: 'denied' } });
    mockedFrom.mockReturnValue(b);
    await expect(
      createTour({ name: 'x', userId: 'u1' }),
    ).rejects.toThrow('denied');
  });
});

describe('listMyTours', () => {
  it('selects tours the user belongs to via tour_members', async () => {
    const tours = [{ id: 't1', name: 'A' }];
    const b = builder({ data: tours, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await listMyTours('u1');

    expect(mockedFrom).toHaveBeenCalledWith('tour_members');
    expect(b.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(result).toEqual(tours);
  });
});

describe('getTour (REQ-F5-006 access)', () => {
  it('returns the tour row when accessible', async () => {
    const tour = { id: 't1', name: 'A', owner_id: 'u1' };
    const b = builder({ data: tour, error: null });
    mockedFrom.mockReturnValue(b);
    const result = await getTour('t1');
    expect(b.eq).toHaveBeenCalledWith('id', 't1');
    expect(result).toEqual(tour);
  });

  it('returns null when RLS hides the row (no error, no data)', async () => {
    const b = builder({ data: null, error: null });
    mockedFrom.mockReturnValue(b);
    const result = await getTour('forbidden');
    expect(result).toBeNull();
  });
});

describe('deleteTour (owner only, REQ-F6-004)', () => {
  it('deletes the tour row by id', async () => {
    const b = builder({ data: null, error: null });
    mockedFrom.mockReturnValue(b);
    await deleteTour('t1');
    expect(mockedFrom).toHaveBeenCalledWith('tours');
    expect(b.delete).toHaveBeenCalled();
    expect(b.eq).toHaveBeenCalledWith('id', 't1');
  });

  it('throws when RLS denies the delete', async () => {
    const b = builder({ data: null, error: { message: 'forbidden' } });
    mockedFrom.mockReturnValue(b);
    await expect(deleteTour('t1')).rejects.toThrow('forbidden');
  });
});

describe('listMembers / getMyRole (REQ-F6-004/005)', () => {
  it('lists members of a tour', async () => {
    const members = [
      { id: 'm1', user_id: 'u1', role: 'owner' },
      { id: 'm2', user_id: 'u2', role: 'member' },
    ];
    const b = builder({ data: members, error: null });
    mockedFrom.mockReturnValue(b);
    const result = await listMembers('t1');
    expect(mockedFrom).toHaveBeenCalledWith('tour_members');
    expect(b.eq).toHaveBeenCalledWith('tour_id', 't1');
    expect(result).toEqual(members);
  });

  it('returns the current user role for a tour', async () => {
    const b = builder({ data: { role: 'owner' }, error: null });
    mockedFrom.mockReturnValue(b);
    const role = await getMyRole({ tourId: 't1', userId: 'u1' });
    expect(role).toBe('owner');
  });

  it('returns null role when user is not a member', async () => {
    const b = builder({ data: null, error: null });
    mockedFrom.mockReturnValue(b);
    const role = await getMyRole({ tourId: 't1', userId: 'u9' });
    expect(role).toBeNull();
  });
});

describe('removeMember (owner only, REQ-F6-004)', () => {
  it('deletes a membership row by id', async () => {
    const b = builder({ data: null, error: null });
    mockedFrom.mockReturnValue(b);
    await removeMember('m2');
    expect(mockedFrom).toHaveBeenCalledWith('tour_members');
    expect(b.delete).toHaveBeenCalled();
    expect(b.eq).toHaveBeenCalledWith('id', 'm2');
  });
});

describe('createInvite + inviteLinkFor (REQ-F6-002 / AC-F6-02)', () => {
  it('inserts an invite row attributed to the inviter and returns it', async () => {
    const invite = {
      id: 'i1',
      tour_id: 't1',
      token: 'abc123',
      status: 'pending',
      invited_by: 'u1',
      invited_email: 'friend@example.com',
    };
    const b = builder({ data: invite, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await createInvite({
      tourId: 't1',
      invitedBy: 'u1',
      email: 'friend@example.com',
    });

    expect(mockedFrom).toHaveBeenCalledWith('tour_invites');
    expect(b.insert).toHaveBeenCalledWith({
      tour_id: 't1',
      invited_by: 'u1',
      invited_email: 'friend@example.com',
    });
    expect(result).toEqual(invite);
  });

  it('builds a shareable link from the token', () => {
    const link = inviteLinkFor('abc123', 'https://app.test');
    expect(link).toBe('https://app.test/invite/abc123');
  });
});

describe('acceptInvite (REQ-F6-003 / AC-F6-03) — atomic RPC (H-02)', () => {
  const mockedRpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

  it('accepts the invite via the single-transaction accept_invite RPC', async () => {
    // The RPC validates the pending invite, inserts membership, and marks the
    // invite accepted in ONE transaction, returning the tour id. No separate
    // read/insert/update from() calls (which were non-atomic, H-02).
    mockedRpc.mockResolvedValue({ data: 't1', error: null });

    const result = await acceptInvite({ token: 'abc123', userId: 'u2' });

    expect(mockedRpc).toHaveBeenCalledWith('accept_invite', {
      p_token: 'abc123',
    });
    expect(result.tourId).toBe('t1');
    // The non-atomic client-side membership insert must no longer be used.
    expect(mockedFrom).not.toHaveBeenCalledWith('tour_members');
  });

  it('throws when the token is invalid (RPC raises)', async () => {
    mockedRpc.mockResolvedValue({
      data: null,
      error: { message: 'invalid or already-used invite' },
    });
    await expect(
      acceptInvite({ token: 'bad', userId: 'u2' }),
    ).rejects.toThrow(/invalid/i);
  });
});

describe('rejectInvite (REQ-F6-003 / AC-F6-03)', () => {
  it('marks the invite rejected without creating a membership', async () => {
    const b = builder({ data: null, error: null });
    mockedFrom.mockReturnValue(b);
    await rejectInvite('abc123');
    expect(mockedFrom).toHaveBeenCalledWith('tour_invites');
    expect(b.update).toHaveBeenCalledWith({ status: 'rejected' });
    expect(b.eq).toHaveBeenCalledWith('token', 'abc123');
    // membership table must NOT be touched.
    expect(mockedFrom).not.toHaveBeenCalledWith('tour_members');
  });
});
