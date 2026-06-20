import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listSpotKinds = vi.fn();
const addSpotKind = vi.fn();

vi.mock('./api', () => ({
  listSpotKinds: (...a: unknown[]) => listSpotKinds(...a),
  addSpotKind: (...a: unknown[]) => addSpotKind(...a),
}));

import { useSpotKinds } from './useSpotKinds';

beforeEach(() => {
  vi.clearAllMocks();
  listSpotKinds.mockResolvedValue(['빵집', '음식점']);
  addSpotKind.mockImplementation((_t: string, name: string) =>
    Promise.resolve(name.trim()),
  );
});

describe('useSpotKinds (per-tour 종류 list)', () => {
  it('loads the tour kind list', async () => {
    const { result } = renderHook(() => useSpotKinds('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listSpotKinds).toHaveBeenCalledWith('t1');
    expect(result.current.kinds).toEqual(['빵집', '음식점']);
  });

  it('persists and appends a new kind via addKind', async () => {
    const { result } = renderHook(() => useSpotKinds('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addKind('카페');
    });

    expect(addSpotKind).toHaveBeenCalledWith('t1', '카페');
    expect(result.current.kinds).toEqual(['빵집', '음식점', '카페']);
  });

  it('is a no-op for a blank or already-present kind', async () => {
    const { result } = renderHook(() => useSpotKinds('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addKind('   ');
      await result.current.addKind('빵집');
    });

    expect(addSpotKind).not.toHaveBeenCalled();
    expect(result.current.kinds).toEqual(['빵집', '음식점']);
  });
});
