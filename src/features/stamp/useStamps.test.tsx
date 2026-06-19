import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listStamps = vi.fn();
vi.mock('./api', () => ({
  listStamps: (...a: unknown[]) => listStamps(...a),
  stampMapBySpot: (rows: Array<{ id: string; spot_id: string; arrived_at: string; user_id: string }>) => {
    const map: Record<string, unknown> = {};
    for (const r of rows) {
      map[r.spot_id] = {
        stamped: true,
        arrivedAt: r.arrived_at,
        stampId: r.id,
        userId: r.user_id,
      };
    }
    return map;
  },
}));

import { useStamps } from './useStamps';

beforeEach(() => {
  vi.clearAllMocks();
  listStamps.mockResolvedValue([
    { id: 'st1', spot_id: 's1', arrived_at: '2026-06-19T01:00:00Z', user_id: 'u1' },
  ]);
});

describe('useStamps (REQ-F1-005 — load valid stamps for the tour)', () => {
  it('loads stamps and exposes a stampBySpot map + stampedSpotIds set', async () => {
    const { result } = renderHook(() => useStamps('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stampBySpot.s1).toMatchObject({ stamped: true });
    expect(result.current.stampedSpotIds.has('s1')).toBe(true);
    expect(listStamps).toHaveBeenCalledWith('t1');
  });

  it('reload re-fetches the stamps', async () => {
    const { result } = renderHook(() => useStamps('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      result.current.reload();
    });
    await waitFor(() => expect(listStamps).toHaveBeenCalledTimes(2));
  });

  it('is inert without a tour id', async () => {
    const { result } = renderHook(() => useStamps(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listStamps).not.toHaveBeenCalled();
  });
});
