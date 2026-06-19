import { beforeEach, describe, expect, it, vi } from 'vitest';

// updateUser is referenced inside the vi.mock factory below, so it must be
// hoisted alongside the mock (a plain top-level const is initialised AFTER the
// hoisted factory runs and would be undefined inside it).
const { updateUser } = vi.hoisted(() => ({
  updateUser: vi.fn(
    (): Promise<{ error: { message: string } | null }> =>
      Promise.resolve({ error: null }),
  ),
}));

vi.mock('../../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: { updateUser },
    },
  };
});

import { supabase } from '../../lib/supabase';
import { getMyProfile, listProfiles, updateMyDisplayName } from './api';

function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'in'];
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listProfiles (Feature 1 — read co-member display names)', () => {
  it('returns an empty map without querying when given no ids', async () => {
    const result = await listProfiles([]);
    expect(result).toEqual({});
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('reads profiles by id and returns a user_id -> display_name map', async () => {
    const rows = [
      { id: 'u1', display_name: '빵돌이' },
      { id: 'u2', display_name: '빵순이' },
    ];
    const b = builder({ data: rows, error: null });
    mockedFrom.mockReturnValue(b);

    const result = await listProfiles(['u1', 'u2']);

    expect(mockedFrom).toHaveBeenCalledWith('profiles');
    expect(b.select).toHaveBeenCalledWith('id, display_name');
    expect(b.in).toHaveBeenCalledWith('id', ['u1', 'u2']);
    expect(result).toEqual({ u1: '빵돌이', u2: '빵순이' });
  });

  it('de-duplicates ids before querying', async () => {
    const b = builder({ data: [], error: null });
    mockedFrom.mockReturnValue(b);
    await listProfiles(['u1', 'u1', 'u2']);
    expect(b.in).toHaveBeenCalledWith('id', ['u1', 'u2']);
  });

  it('throws when supabase returns an error', async () => {
    const b = builder({ data: null, error: { message: 'denied' } });
    mockedFrom.mockReturnValue(b);
    await expect(listProfiles(['u1'])).rejects.toThrow('denied');
  });
});

describe('getMyProfile (Feature — read own profile for the edit page)', () => {
  it('reads the caller own profile by id and returns id + display_name', async () => {
    const b = builder({
      data: { id: 'u1', display_name: '빵돌이' },
      error: null,
    });
    mockedFrom.mockReturnValue(b);

    const result = await getMyProfile('u1');

    expect(mockedFrom).toHaveBeenCalledWith('profiles');
    expect(b.select).toHaveBeenCalledWith('id, display_name');
    expect(b.eq).toHaveBeenCalledWith('id', 'u1');
    expect(result).toEqual({ id: 'u1', display_name: '빵돌이' });
  });

  it('returns null when the profile row is missing', async () => {
    const b = builder({ data: null, error: null });
    mockedFrom.mockReturnValue(b);
    await expect(getMyProfile('u1')).resolves.toBeNull();
  });

  it('throws when supabase returns an error', async () => {
    const b = builder({ data: null, error: { message: 'denied' } });
    mockedFrom.mockReturnValue(b);
    await expect(getMyProfile('u1')).rejects.toThrow('denied');
  });
});

describe('updateMyDisplayName (Feature — change own display name)', () => {
  it('rejects an empty / whitespace-only name with a Korean message', async () => {
    await expect(updateMyDisplayName('u1', '   ')).rejects.toThrow(
      '이름을 입력해 주세요.',
    );
    // Validation must happen before any network call.
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('trims the name and updates the own profile row (RLS enforces ownership)', async () => {
    const b = builder({ data: null, error: null });
    mockedFrom.mockReturnValue(b);

    await updateMyDisplayName('u1', '  빵순이  ');

    expect(mockedFrom).toHaveBeenCalledWith('profiles');
    expect(b.update).toHaveBeenCalledWith({ display_name: '빵순이' });
    expect(b.eq).toHaveBeenCalledWith('id', 'u1');
    // Keep the auth metadata in sync so other surfaces stay consistent.
    expect(updateUser).toHaveBeenCalledWith({
      data: { display_name: '빵순이' },
    });
  });

  it('throws when the profile update fails', async () => {
    const b = builder({ data: null, error: { message: 'denied' } });
    mockedFrom.mockReturnValue(b);
    await expect(updateMyDisplayName('u1', '빵순이')).rejects.toThrow('denied');
  });

  it('does not fail the update when only the auth-metadata sync errors', async () => {
    // The profile row is the source of truth; a metadata-sync hiccup must not
    // surface as a failed name change to the user.
    const b = builder({ data: null, error: null });
    mockedFrom.mockReturnValue(b);
    updateUser.mockResolvedValueOnce({ error: { message: 'metadata boom' } });
    await expect(updateMyDisplayName('u1', '빵순이')).resolves.toBeUndefined();
  });
});
