import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listPendingCheckIns = vi.fn();
vi.mock('./api', () => ({
  listPendingCheckIns: (...a: unknown[]) => listPendingCheckIns(...a),
}));

import { usePendingCheckIns } from './usePendingCheckIns';

beforeEach(() => {
  vi.clearAllMocks();
  listPendingCheckIns.mockResolvedValue([
    { id: 'r1', spot_id: 's1', tour_id: 't1', requester_id: 'u2', status: 'pending' },
  ]);
});

describe('usePendingCheckIns (REQ-F1-007 — load pending requests for the tour)', () => {
  it('loads the tour pending requests', async () => {
    const { result } = renderHook(() => usePendingCheckIns('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pendingRequests).toHaveLength(1);
    expect(result.current.pendingRequests[0].id).toBe('r1');
    expect(listPendingCheckIns).toHaveBeenCalledWith('t1');
  });

  it('reload re-fetches the pending requests', async () => {
    const { result } = renderHook(() => usePendingCheckIns('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      result.current.reload();
    });
    await waitFor(() => expect(listPendingCheckIns).toHaveBeenCalledTimes(2));
  });

  it('is inert without a tour id', async () => {
    const { result } = renderHook(() => usePendingCheckIns(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listPendingCheckIns).not.toHaveBeenCalled();
  });
});
