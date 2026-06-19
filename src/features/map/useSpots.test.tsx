import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listSpots = vi.fn();
const listSpotMenusForTour = vi.fn();

vi.mock('./api', () => ({
  listSpots: (...a: unknown[]) => listSpots(...a),
}));
vi.mock('../menu/api', () => ({
  listSpotMenusForTour: (...a: unknown[]) => listSpotMenusForTour(...a),
}));

import { useSpots } from './useSpots';

beforeEach(() => {
  vi.clearAllMocks();
  listSpots.mockResolvedValue([
    { id: 's1', tour_id: 't1', name: 'A', order_index: 1, lat: 1, lng: 2 },
  ]);
  listSpotMenusForTour.mockResolvedValue({
    s1: [{ id: 'm1', spot_id: 's1', menu_text: '소금빵', author_id: 'u1' }],
  });
});

describe('useSpots (REQ-F3-001, REQ-F4-002)', () => {
  it('loads spots ordered and the menus map for the tour', async () => {
    const { result } = renderHook(() => useSpots('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.spots).toHaveLength(1);
    expect(result.current.menusBySpot.s1).toHaveLength(1);
    expect(listSpots).toHaveBeenCalledWith('t1');
  });

  it('reload re-fetches spots and menus', async () => {
    const { result } = renderHook(() => useSpots('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      result.current.reload();
    });
    await waitFor(() => expect(listSpots).toHaveBeenCalledTimes(2));
  });

  it('is inert without a tour id', async () => {
    const { result } = renderHook(() => useSpots(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listSpots).not.toHaveBeenCalled();
  });
});
