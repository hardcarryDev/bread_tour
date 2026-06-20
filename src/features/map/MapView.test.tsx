import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Spot } from '../../types/database';
import type { SpotMenuWithAuthor } from '../menu/api';

// --- Kakao SDK mock ------------------------------------------------------
// We record every marker created (with its order label) and the polyline path
// so the test can assert markers render in visit order and the route redraws.
interface FakeMarker {
  position: unknown;
  title?: string;
  clickHandler?: () => void;
  setMap: ReturnType<typeof vi.fn>;
}
interface FakeOverlay {
  content: unknown;
  setMap: ReturnType<typeof vi.fn>;
}

interface FakePolyline {
  path: unknown[];
  strokeColor?: string;
  setMap: ReturnType<typeof vi.fn>;
}

interface FakeCircle {
  center: { lat: number; lng: number };
  radius: number;
  fillColor?: string;
  setMap: ReturnType<typeof vi.fn>;
  setPosition: ReturnType<typeof vi.fn>;
  setRadius: ReturnType<typeof vi.fn>;
  setOptions: ReturnType<typeof vi.fn>;
}

const created = {
  markers: [] as FakeMarker[],
  overlays: [] as FakeOverlay[],
  polylinePaths: [] as unknown[][],
  polylines: [] as FakePolyline[],
  circles: [] as FakeCircle[],
};

const eventHandlers: Array<{ target: unknown; type: string; cb: () => void }> =
  [];

function makeKakao() {
  const maps = {
    LatLng: vi.fn(function (this: { lat: number; lng: number }, lat: number, lng: number) {
      this.lat = lat;
      this.lng = lng;
    }),
    LatLngBounds: vi.fn(() => ({ extend: vi.fn() })),
    Map: vi.fn(() => ({
      setBounds: vi.fn(),
      setCenter: vi.fn(),
      relayout: vi.fn(),
    })),
    Marker: vi.fn((opts: { position: unknown; title?: string }) => {
      const marker: FakeMarker = {
        position: opts.position,
        title: opts.title,
        setMap: vi.fn(),
      };
      created.markers.push(marker);
      return marker;
    }),
    CustomOverlay: vi.fn((opts: { content: unknown }) => {
      const overlay: FakeOverlay = { content: opts.content, setMap: vi.fn() };
      created.overlays.push(overlay);
      return overlay;
    }),
    Polyline: vi.fn((opts: { path: unknown[]; strokeColor?: string }) => {
      created.polylinePaths.push(opts.path);
      const polyline: FakePolyline = {
        path: opts.path,
        strokeColor: opts.strokeColor,
        setMap: vi.fn(),
      };
      created.polylines.push(polyline);
      return polyline;
    }),
    Circle: vi.fn(
      (opts: {
        center: { lat: number; lng: number };
        radius: number;
        fillColor?: string;
      }) => {
        const circle: FakeCircle = {
          center: opts.center,
          radius: opts.radius,
          fillColor: opts.fillColor,
          setMap: vi.fn(),
          setPosition: vi.fn(function (this: FakeCircle, ll: {
            lat: number;
            lng: number;
          }) {
            this.center = ll;
          }),
          setRadius: vi.fn(function (this: FakeCircle, r: number) {
            this.radius = r;
          }),
          setOptions: vi.fn(),
        };
        created.circles.push(circle);
        return circle;
      },
    ),
    event: {
      addListener: vi.fn((target: unknown, type: string, cb: () => void) => {
        eventHandlers.push({ target, type, cb });
      }),
    },
    load: (cb: () => void) => cb(),
  };
  return { maps } as unknown as KakaoNamespace;
}

const loadKakaoMaps = vi.fn();
vi.mock('../../lib/kakao', () => ({
  loadKakaoMaps: (...a: unknown[]) => loadKakaoMaps(...a),
}));

import MapView from './MapView';

const spots: Spot[] = [
  {
    id: 's1',
    tour_id: 't1',
    name: '성수 베이커리',
    kind: 'bakery',
    lat: 37.544,
    lng: 127.055,
    radius_m: 50,
    order_index: 1,
    created_at: 'x',
    updated_at: 'x',
  },
  {
    id: 's2',
    tour_id: 't1',
    name: '연남 식당',
    kind: 'restaurant',
    lat: 37.561,
    lng: 126.925,
    radius_m: 50,
    order_index: 2,
    created_at: 'x',
    updated_at: 'x',
  },
  {
    id: 's3',
    tour_id: 't1',
    name: '망원 빵집',
    kind: 'bakery',
    lat: 37.556,
    lng: 126.91,
    radius_m: 50,
    order_index: 3,
    created_at: 'x',
    updated_at: 'x',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  created.markers = [];
  created.overlays = [];
  created.polylinePaths = [];
  created.polylines = [];
  created.circles = [];
  eventHandlers.length = 0;
  loadKakaoMaps.mockResolvedValue(makeKakao());
});

describe('MapView markers and ordering (REQ-F3-001/002 / AC-F3-01)', () => {
  it('renders a numbered marker for each spot in visit order', async () => {
    render(<MapView spots={spots} />);

    await waitFor(() => expect(created.markers.length).toBe(3));

    // Each spot gets a numbered order overlay (1, 2, 3) rendered on the map.
    await waitFor(() => expect(created.overlays.length).toBeGreaterThanOrEqual(3));
    const labels = created.overlays
      .map((o) => (typeof o.content === 'string' ? o.content : ''))
      .join(' ');
    expect(labels).toContain('1');
    expect(labels).toContain('2');
    expect(labels).toContain('3');
  });

  it('draws one colored connector segment between each consecutive spot pair', async () => {
    render(<MapView spots={spots} />);
    // 3 spots -> 2 segment polylines, each a 2-point line (so overlapping legs
    // can be colored distinctly rather than one indistinguishable line).
    await waitFor(() => expect(created.polylinePaths.length).toBe(2));
    expect(created.polylinePaths.every((p) => p.length === 2)).toBe(true);
  });

  it('draws the order connector by default (showOrderConnector implied true)', async () => {
    render(<MapView spots={spots} />);
    // 2-point connector segments are present for the 3-spot order.
    await waitFor(() =>
      expect(created.polylines.some((p) => p.path.length === 2)).toBe(true),
    );
  });

  it('does not draw the order connector when showOrderConnector is false', async () => {
    render(<MapView spots={spots} showOrderConnector={false} />);
    // Markers still render, but no straight order-connector polylines are drawn.
    await waitFor(() => expect(created.markers.length).toBe(3));
    expect(created.polylines.length).toBe(0);
  });
});

describe('MapView reorder redraw (REQ-F3-003 / AC-F3-02)', () => {
  it('redraws markers and the route line when the spot order changes', async () => {
    const { rerender } = render(<MapView spots={spots} />);
    await waitFor(() => expect(created.markers.length).toBe(3));
    const firstPathCount = created.polylinePaths.length;

    // Reorder: move s3 to the front.
    const reordered = [spots[2], spots[0], spots[1]].map((s, i) => ({
      ...s,
      order_index: i + 1,
    }));
    rerender(<MapView spots={reordered} />);

    // A new polyline must be drawn for the new order (redraw happened).
    await waitFor(() =>
      expect(created.polylinePaths.length).toBeGreaterThan(firstPathCount),
    );
  });
});

describe('MapView marker tap summary (REQ-F3-004 / AC-F3-03)', () => {
  it('shows name, order, menus and a stamp-status placeholder on marker select', async () => {
    const menusBySpot: Record<string, SpotMenuWithAuthor[]> = {
      s1: [
        {
          id: 'm1',
          spot_id: 's1',
          author_id: 'u1',
          menu_text: '소금빵',
          created_at: 'x',
          updated_at: 'x',
          author: { display_name: 'Alice' },
        },
      ],
    };
    render(<MapView spots={spots} menusBySpot={menusBySpot} />);
    await waitFor(() => expect(created.markers.length).toBe(3));

    // Simulate a Kakao marker click for the first spot.
    const firstClick = eventHandlers.find((h) => h.type === 'click');
    expect(firstClick).toBeDefined();
    act(() => firstClick!.cb());

    // The summary shows name + order + menu + a neutral stamp status (Slice C).
    expect(await screen.findByTestId('marker-summary')).toBeInTheDocument();
    expect(screen.getByTestId('marker-summary')).toHaveTextContent('성수 베이커리');
    expect(screen.getByTestId('marker-summary')).toHaveTextContent('소금빵');
    expect(screen.getByTestId('marker-summary')).toHaveTextContent('Alice');
    // Stamp status is a structured placeholder Slice C fills in.
    expect(screen.getByTestId('marker-stamp-status')).toBeInTheDocument();
  });

  it('shows "추천 메뉴 없음" in the summary when a spot has no menus (REQ-F4-004 / AC-F4-03)', async () => {
    render(<MapView spots={spots} menusBySpot={{}} />);
    await waitFor(() => expect(created.markers.length).toBe(3));
    const firstClick = eventHandlers.find((h) => h.type === 'click');
    act(() => firstClick!.cb());
    expect(await screen.findByTestId('marker-summary')).toHaveTextContent(
      '추천 메뉴 없음',
    );
  });
});

describe('MapView route polyline (REQ-F2-001 / directions overlay)', () => {
  // The real road route from getRoute is a multi-point polyline. It must be
  // drawn on the map (distinct color from the gray order connector) so the user
  // sees the actual road curve, not just the straight spot-order line.
  const routePath = [
    { lat: 37.544, lng: 127.055 },
    { lat: 37.55, lng: 127.0 },
    { lat: 37.558, lng: 126.96 },
    { lat: 37.561, lng: 126.925 },
  ];

  it('draws the route path as a polyline with all its points', async () => {
    render(<MapView spots={spots} routePath={routePath} />);
    await waitFor(() => expect(created.markers.length).toBe(3));

    // A polyline with the full multi-point route path (4 points) is drawn —
    // not just the 2-endpoint straight line.
    await waitFor(() =>
      expect(
        created.polylines.some((p) => p.path.length === routePath.length),
      ).toBe(true),
    );
  });

  it('renders the route line in a distinct color from the order connector', async () => {
    render(<MapView spots={spots} routePath={routePath} />);
    await waitFor(() =>
      expect(
        created.polylines.some((p) => p.path.length === routePath.length),
      ).toBe(true),
    );
    const route = created.polylines.find(
      (p) => p.path.length === routePath.length,
    );
    // Order connector is now per-segment (2-point) polylines; pick one.
    const order = created.polylines.find((p) => p.path.length === 2);
    expect(route?.strokeColor).toBeDefined();
    expect(order?.strokeColor).toBeDefined();
    expect(route?.strokeColor).not.toBe(order?.strokeColor);
  });

  it('replaces the drawn route polyline when a new route is requested', async () => {
    const { rerender } = render(
      <MapView spots={spots} routePath={routePath} />,
    );
    await waitFor(() =>
      expect(
        created.polylines.some((p) => p.path.length === routePath.length),
      ).toBe(true),
    );
    const firstRoute = created.polylines.find(
      (p) => p.path.length === routePath.length,
    )!;

    const nextRoute = [
      { lat: 37.561, lng: 126.925 },
      { lat: 37.557, lng: 126.915 },
      { lat: 37.556, lng: 126.91 },
    ];
    rerender(<MapView spots={spots} routePath={nextRoute} />);

    // Previous route polyline is removed and a new one (3 points) is drawn.
    await waitFor(() => expect(firstRoute.setMap).toHaveBeenCalledWith(null));
    await waitFor(() =>
      expect(
        created.polylines.some((p) => p.path.length === nextRoute.length),
      ).toBe(true),
    );
  });

  it('removes the route polyline when the route is cleared', async () => {
    const { rerender } = render(
      <MapView spots={spots} routePath={routePath} />,
    );
    await waitFor(() =>
      expect(
        created.polylines.some((p) => p.path.length === routePath.length),
      ).toBe(true),
    );
    const route = created.polylines.find(
      (p) => p.path.length === routePath.length,
    )!;

    rerender(<MapView spots={spots} routePath={undefined} />);
    await waitFor(() => expect(route.setMap).toHaveBeenCalledWith(null));
  });

  it('draws each whole-tour route leg in its own color (routeLegs)', async () => {
    // Leg lengths 3 and 4 are chosen so they don't collide with the 2-point
    // spot-order connector segments also present on the map.
    const routeLegs = [
      [
        { lat: 37.544, lng: 127.055 },
        { lat: 37.55, lng: 127.0 },
        { lat: 37.561, lng: 126.925 },
      ],
      [
        { lat: 37.561, lng: 126.925 },
        { lat: 37.558, lng: 126.92 },
        { lat: 37.557, lng: 126.915 },
        { lat: 37.556, lng: 126.91 },
      ],
    ];
    render(<MapView spots={spots} routeLegs={routeLegs} />);
    // One polyline per leg, with the leg's full geometry (3 + 4 points).
    await waitFor(() =>
      expect(created.polylines.some((p) => p.path.length === 3)).toBe(true),
    );
    const legA = created.polylines.find((p) => p.path.length === 3);
    const legB = created.polylines.find((p) => p.path.length === 4);
    expect(legA?.strokeColor).toBeDefined();
    expect(legB?.strokeColor).toBeDefined();
    // Adjacent legs are drawn in distinct colors.
    expect(legA?.strokeColor).not.toBe(legB?.strokeColor);
  });

  it('clears the colored route legs when routeLegs is removed', async () => {
    const routeLegs = [
      [
        { lat: 37.544, lng: 127.055 },
        { lat: 37.55, lng: 127.0 },
        { lat: 37.561, lng: 126.925 },
      ],
    ];
    const { rerender } = render(<MapView spots={spots} routeLegs={routeLegs} />);
    await waitFor(() =>
      expect(created.polylines.some((p) => p.path.length === 3)).toBe(true),
    );
    const leg = created.polylines.find((p) => p.path.length === 3)!;
    rerender(<MapView spots={spots} routeLegs={undefined} />);
    await waitFor(() => expect(leg.setMap).toHaveBeenCalledWith(null));
  });
});

describe('MapView "내 위치" live location marker (REQ-F3 location indicator)', () => {
  // The spot order line + 3 spot markers are amber numbered pins; the user's own
  // location must be a distinct blue dot (a Circle), updated live and removed
  // when tracking stops. An accuracy circle is drawn when accuracy is provided.

  it('does not draw a my-location marker when currentLocation is null', async () => {
    render(<MapView spots={spots} currentLocation={null} />);
    await waitFor(() => expect(created.markers.length).toBe(3));
    // No Circle overlays from the location indicator (spots use Marker/Polyline).
    expect(created.circles.length).toBe(0);
  });

  it('draws a blue dot at the current location while tracking', async () => {
    render(
      <MapView spots={spots} currentLocation={{ lat: 37.5, lng: 127.01 }} />,
    );
    await waitFor(() => expect(created.markers.length).toBe(3));
    // A location dot Circle is created at the reported position.
    await waitFor(() => expect(created.circles.length).toBeGreaterThanOrEqual(1));
    const dot = created.circles.find((c) => c.fillColor === '#2563eb');
    expect(dot).toBeDefined();
    expect(dot!.center).toMatchObject({ lat: 37.5, lng: 127.01 });
    // Drawn on the map.
    expect(dot!.setMap).toHaveBeenCalled();
  });

  it('also draws a translucent accuracy circle when accuracy is provided', async () => {
    render(
      <MapView
        spots={spots}
        currentLocation={{ lat: 37.5, lng: 127.01, accuracy: 30 }}
      />,
    );
    await waitFor(() => expect(created.markers.length).toBe(3));
    // Two circles: the dot + the accuracy circle (radius == accuracy metres).
    await waitFor(() => expect(created.circles.length).toBeGreaterThanOrEqual(2));
    const accuracy = created.circles.find((c) => c.radius === 30);
    expect(accuracy).toBeDefined();
    expect(accuracy!.setMap).toHaveBeenCalled();
  });

  it('moves the existing dot in place when the location updates', async () => {
    const { rerender } = render(
      <MapView spots={spots} currentLocation={{ lat: 37.5, lng: 127.01 }} />,
    );
    await waitFor(() => expect(created.circles.length).toBeGreaterThanOrEqual(1));
    const dot = created.circles.find((c) => c.fillColor === '#2563eb')!;
    const circleCountBefore = created.circles.length;

    rerender(
      <MapView spots={spots} currentLocation={{ lat: 37.52, lng: 127.03 }} />,
    );

    // The dot is repositioned (not recreated): setPosition called, no new dot.
    await waitFor(() => expect(dot.setPosition).toHaveBeenCalled());
    expect(created.circles.length).toBe(circleCountBefore);
    expect(dot.center).toMatchObject({ lat: 37.52, lng: 127.03 });
  });

  it('removes the my-location marker when tracking stops (currentLocation null)', async () => {
    const { rerender } = render(
      <MapView
        spots={spots}
        currentLocation={{ lat: 37.5, lng: 127.01, accuracy: 30 }}
      />,
    );
    await waitFor(() => expect(created.circles.length).toBeGreaterThanOrEqual(2));
    const dot = created.circles.find((c) => c.fillColor === '#2563eb')!;
    const accuracy = created.circles.find((c) => c.radius === 30)!;

    rerender(<MapView spots={spots} currentLocation={null} />);

    // Both overlays are removed from the map.
    await waitFor(() => expect(dot.setMap).toHaveBeenCalledWith(null));
    await waitFor(() => expect(accuracy.setMap).toHaveBeenCalledWith(null));
  });
});

describe('MapView SDK load failure (graceful, EC-06 style)', () => {
  it('shows an error message and does not crash when the SDK fails to load', async () => {
    loadKakaoMaps.mockRejectedValue(new Error('sdk down'));
    render(<MapView spots={spots} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/지도/);
  });
});
