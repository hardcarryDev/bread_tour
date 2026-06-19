import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Spot } from '../../types/database';
import DirectionsPanel from './DirectionsPanel';

const getRoute = vi.fn();
vi.mock('./api', () => ({
  getRoute: (...a: unknown[]) => getRoute(...a),
}));

function spot(p: Partial<Spot> & Pick<Spot, 'id' | 'order_index'>): Spot {
  return {
    tour_id: 't1',
    name: p.id,
    kind: 'bakery',
    lat: 37.5,
    lng: 127.0,
    radius_m: 50,
    created_at: 'x',
    updated_at: 'x',
    ...p,
  } as Spot;
}

const spots: Spot[] = [
  spot({ id: 's1', name: '성수 베이커리', order_index: 1, lat: 37.5, lng: 127.0 }),
  spot({ id: 's2', name: '연남 식당', order_index: 2, lat: 37.51, lng: 126.92 }),
  spot({ id: 's3', name: '망원 빵집', order_index: 3, lat: 37.55, lng: 126.91 }),
];

beforeEach(() => {
  vi.clearAllMocks();
  getRoute.mockResolvedValue({
    mode: 'car',
    path: [
      { lat: 37.5, lng: 127.0 },
      { lat: 37.51, lng: 126.92 },
    ],
    distanceM: 1500,
    durationSec: 480,
    fallback: false,
  });
});

// Helper: pick origin/destination then request the between-spots route.
async function routeBetween(from: string, to: string) {
  await userEvent.selectOptions(screen.getByLabelText('출발 장소'), from);
  await userEvent.selectOptions(screen.getByLabelText('도착 장소'), to);
  await userEvent.click(screen.getByRole('button', { name: '길찾기' }));
  await waitFor(() => expect(getRoute).toHaveBeenCalled());
}

describe('DirectionsPanel distance/time (REQ-F2-001/002 / AC-F2-01)', () => {
  it('routes between two spots and shows distance + estimated minutes', async () => {
    const onRoute = vi.fn();
    render(
      <DirectionsPanel
        spots={spots}
        stampedSpotIds={new Set()}
        currentLocation={null}
        onRoute={onRoute}
      />,
    );

    await routeBetween('s1', 's2');
    expect(screen.getByTestId('route-distance')).toHaveTextContent('1.5km');
    expect(screen.getByTestId('route-duration')).toHaveTextContent('8분');
    // Default mode is car; a real route (fallback:false) is labelled "자동차 기준".
    expect(screen.getByTestId('route-mode')).toHaveTextContent('자동차 기준');
    // The computed polyline path is handed up for the map to draw.
    expect(onRoute).toHaveBeenCalledWith(
      expect.objectContaining({ distanceM: 1500 }),
    );
  });
});

describe('DirectionsPanel travel-mode toggle (도보/대중교통/차)', () => {
  it('defaults to car and calls getRoute with mode "car"', async () => {
    render(
      <DirectionsPanel
        spots={spots}
        stampedSpotIds={new Set()}
        currentLocation={null}
        onRoute={vi.fn()}
      />,
    );
    // The 차 tab is pressed by default.
    expect(screen.getByRole('button', { name: '차' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await routeBetween('s1', 's2');
    expect(getRoute).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ mode: 'car' }),
    );
  });

  it('selecting 도보 calls getRoute with mode "walk" and labels 도보 기준', async () => {
    getRoute.mockResolvedValue({
      mode: 'walk',
      path: [
        { lat: 37.5, lng: 127.0 },
        { lat: 37.51, lng: 126.92 },
      ],
      distanceM: 900,
      durationSec: 720,
      fallback: false,
    });
    render(
      <DirectionsPanel
        spots={spots}
        stampedSpotIds={new Set()}
        currentLocation={null}
        onRoute={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '도보' }));
    expect(screen.getByRole('button', { name: '도보' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await routeBetween('s1', 's2');
    expect(getRoute).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ mode: 'walk' }),
    );
    expect(screen.getByTestId('route-mode')).toHaveTextContent('도보 기준');
  });

  it('selecting 대중교통 calls getRoute with mode "transit", renders legs + 환승/요금, feeds path to map', async () => {
    const onRoute = vi.fn();
    getRoute.mockResolvedValue({
      mode: 'transit',
      path: [
        { lat: 37.5, lng: 127.0 },
        { lat: 37.505, lng: 126.96 },
        { lat: 37.51, lng: 126.92 },
      ],
      distanceM: 6200,
      durationSec: 1500,
      fallback: false,
      transferCount: 1,
      fare: 1450,
      legs: [
        { mode: 'WALK', sectionTime: 300 },
        { mode: 'BUS', sectionTime: 600, route: '간선 102' },
        { mode: 'SUBWAY', sectionTime: 480, route: '1호선' },
        { mode: 'WALK', sectionTime: 120 },
      ],
    });
    render(
      <DirectionsPanel
        spots={spots}
        stampedSpotIds={new Set()}
        currentLocation={null}
        onRoute={onRoute}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '대중교통' }));
    await routeBetween('s1', 's2');

    expect(getRoute).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ mode: 'transit' }),
    );
    expect(screen.getByTestId('route-mode')).toHaveTextContent('대중교통 기준');

    // Legs breakdown: Korean mode labels for each segment.
    const legs = screen.getByTestId('route-legs');
    expect(legs).toHaveTextContent('도보');
    expect(legs).toHaveTextContent('버스');
    expect(legs).toHaveTextContent('간선 102');
    expect(legs).toHaveTextContent('지하철');
    expect(legs).toHaveTextContent('1호선');

    // Transfer count + fare.
    expect(screen.getByTestId('route-transit-meta')).toHaveTextContent('환승 1회');
    expect(screen.getByTestId('route-transit-meta')).toHaveTextContent('1,450원');

    // Path still handed up for the map polyline.
    expect(onRoute).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'transit', distanceM: 6200 }),
    );
  });
});

describe('DirectionsPanel controlled mode (shared with 내기준정렬)', () => {
  // When mode + onModeChange are provided, the panel is controlled: the pressed
  // tab reflects the prop, and clicking a tab calls onModeChange (so the parent
  // can share the selected mode with the 내기준정렬 button).
  it('reflects the controlled mode prop in the pressed tab', () => {
    render(
      <DirectionsPanel
        spots={spots}
        stampedSpotIds={new Set()}
        currentLocation={null}
        onRoute={vi.fn()}
        mode="transit"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '대중교통' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '차' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('calls onModeChange when a tab is clicked (controlled)', async () => {
    const onModeChange = vi.fn();
    render(
      <DirectionsPanel
        spots={spots}
        stampedSpotIds={new Set()}
        currentLocation={null}
        onRoute={vi.fn()}
        mode="car"
        onModeChange={onModeChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '도보' }));
    expect(onModeChange).toHaveBeenCalledWith('walk');
  });

  it('routes with the controlled mode prop', async () => {
    getRoute.mockResolvedValue({
      mode: 'walk',
      path: [
        { lat: 37.5, lng: 127.0 },
        { lat: 37.51, lng: 126.92 },
      ],
      distanceM: 900,
      durationSec: 720,
      fallback: false,
    });
    render(
      <DirectionsPanel
        spots={spots}
        stampedSpotIds={new Set()}
        currentLocation={null}
        onRoute={vi.fn()}
        mode="walk"
        onModeChange={vi.fn()}
      />,
    );
    await routeBetween('s1', 's2');
    expect(getRoute).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ mode: 'walk' }),
    );
  });
});

describe('DirectionsPanel guide-to-next (REQ-F2-003 / AC-F2-02)', () => {
  it('routes from current location to the next unvisited spot in order', async () => {
    const current = { lat: 37.49, lng: 127.01 };
    render(
      <DirectionsPanel
        spots={spots}
        stampedSpotIds={new Set(['s1'])} // s1 visited -> next is s2
        currentLocation={current}
        onRoute={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: '다음 장소로 안내' }),
    );

    await waitFor(() => expect(getRoute).toHaveBeenCalled());
    const [from, to] = getRoute.mock.calls[0];
    expect(from).toEqual(current);
    // Next unvisited spot in visit order is s2.
    expect(to).toEqual({ lat: 37.51, lng: 126.92 });
  });

  it('enables guide-to-next once a current location is available (C-01 / REQ-F2-003)', () => {
    render(
      <DirectionsPanel
        spots={spots}
        stampedSpotIds={new Set()}
        currentLocation={{ lat: 37.49, lng: 127.01 }}
        onRoute={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: '다음 장소로 안내' }),
    ).toBeEnabled();
  });

  it('disables guide-to-next when current location is unavailable', () => {
    render(
      <DirectionsPanel
        spots={spots}
        stampedSpotIds={new Set()}
        currentLocation={null}
        onRoute={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: '다음 장소로 안내' }),
    ).toBeDisabled();
  });
});

describe('DirectionsPanel fallback notice (A11)', () => {
  it('notes when a car result is a straight-line estimate', async () => {
    getRoute.mockResolvedValue({
      mode: 'car',
      path: [
        { lat: 37.5, lng: 127.0 },
        { lat: 37.51, lng: 126.92 },
      ],
      distanceM: 1800,
      durationSec: 1300,
      fallback: true,
    });
    render(
      <DirectionsPanel
        spots={spots}
        stampedSpotIds={new Set()}
        currentLocation={null}
        onRoute={vi.fn()}
      />,
    );
    await routeBetween('s1', 's2');
    expect(screen.getByTestId('route-fallback')).toHaveTextContent(
      '직선 거리 기준 추정',
    );
    // A straight-line fallback must NOT claim a travel mode.
    expect(screen.queryByTestId('route-mode')).not.toBeInTheDocument();
  });

  it('shows a clear TMAP/no-route message when walk falls back to straight line', async () => {
    getRoute.mockResolvedValue({
      // Fallback omits mode (straight line is not a real walk/transit route).
      path: [
        { lat: 37.5, lng: 127.0 },
        { lat: 37.51, lng: 126.92 },
      ],
      distanceM: 1800,
      durationSec: 1300,
      fallback: true,
    });
    render(
      <DirectionsPanel
        spots={spots}
        stampedSpotIds={new Set()}
        currentLocation={null}
        onRoute={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '도보' }));
    await routeBetween('s1', 's2');

    // Clear Korean message distinguishing "TMAP not configured / no route".
    const fallback = screen.getByTestId('route-fallback');
    expect(fallback).toHaveTextContent('TMAP 미설정');
    expect(fallback).toHaveTextContent('직선 거리');
    // Still shows the straight-line estimate, not a raw error.
    expect(screen.getByTestId('route-distance')).toHaveTextContent('1.8km');
    expect(screen.queryByTestId('route-mode')).not.toBeInTheDocument();
  });
});
