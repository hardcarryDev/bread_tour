import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPathRoute, getRoute } from './api';
import type { LatLng, RouteResult } from './route';

// Mock the shared supabase client so the default transport
// (supabase.functions.invoke) never hits a live Edge Function.
const invokeMock = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

const A: LatLng = { lat: 37.5, lng: 127.0 };
const B: LatLng = { lat: 37.51, lng: 127.0 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getRoute (REQ-F2-001/002 — route with distance + duration)', () => {
  it('returns the injected transport route distance, duration and path', async () => {
    // The transport returns an already-normalized RouteResult (the Edge
    // Function does the Kakao->RouteResult normalization server-side).
    const route: RouteResult = {
      path: [
        { lat: 37.5, lng: 127.0 },
        { lat: 37.51, lng: 127.0 },
      ],
      distanceM: 1200,
      durationSec: 480,
      fallback: false,
    };
    const fetchRoute = vi.fn().mockResolvedValue(route);

    const r = await getRoute(A, B, { fetchRoute });

    // Defaults to car mode (backward compatibility).
    expect(fetchRoute).toHaveBeenCalledWith(A, B, 'car');
    expect(r.distanceM).toBe(1200);
    expect(r.durationSec).toBe(480);
    expect(r.fallback).toBe(false);
    expect(r.path[0]).toEqual({ lat: 37.5, lng: 127.0 });
    expect(r.path[r.path.length - 1]).toEqual({ lat: 37.51, lng: 127.0 });
  });
});

describe('getRoute fallback (A11 — no usable route)', () => {
  it('falls back to a straight line when the transport returns a too-short path', async () => {
    const fetchRoute = vi.fn().mockResolvedValue({
      path: [{ lat: 37.5, lng: 127.0 }],
      distanceM: 0,
      durationSec: 0,
      fallback: false,
    } as RouteResult);
    const r = await getRoute(A, B, { fetchRoute });
    expect(r.fallback).toBe(true);
    expect(r.path).toHaveLength(2);
    expect(r.distanceM).toBeGreaterThan(0);
  });
});

describe('getRoute API failure (REQ-F2-004 / AC-F2-03)', () => {
  it('falls back to a straight line (does not throw) when the transport fails', async () => {
    const fetchRoute = vi.fn().mockRejectedValue(new Error('directions 500'));
    const r = await getRoute(A, B, { fetchRoute });
    // The map stays usable: we still return a drawable straight-line route.
    expect(r.fallback).toBe(true);
    expect(r.path).toHaveLength(2);
  });
});

describe('getRoute default transport (directions Edge Function via supabase.functions.invoke)', () => {
  it('invokes the directions function with origin/destination and returns its route', async () => {
    const route: RouteResult = {
      path: [
        { lat: 37.5, lng: 127.0 },
        { lat: 37.51, lng: 127.0 },
      ],
      distanceM: 800,
      durationSec: 300,
      fallback: false,
    };
    invokeMock.mockResolvedValue({ data: route, error: null });

    // No fetchRoute injected -> exercises defaultFetchRoute.
    const r = await getRoute(A, B);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [name, options] = invokeMock.mock.calls[0];
    expect(name).toBe('directions');
    // Body now carries the mode (defaults to car for backward compatibility).
    expect(options.body).toEqual({ origin: A, destination: B, mode: 'car' });
    expect(r.distanceM).toBe(800);
    expect(r.fallback).toBe(false);
  });

  it('forwards the selected mode to the function body and result', async () => {
    const walkRoute: RouteResult = {
      mode: 'walk',
      path: [
        { lat: 37.5, lng: 127.0 },
        { lat: 37.505, lng: 127.0 },
        { lat: 37.51, lng: 127.0 },
      ],
      distanceM: 1100,
      durationSec: 820,
      fallback: false,
    };
    invokeMock.mockResolvedValue({ data: walkRoute, error: null });

    const r = await getRoute(A, B, { mode: 'walk' });

    const [, options] = invokeMock.mock.calls[0];
    expect(options.body).toEqual({ origin: A, destination: B, mode: 'walk' });
    expect(r.mode).toBe('walk');
    expect(r.distanceM).toBe(1100);
  });

  it('falls back to a straight line when the function returns an error', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Unauthorized' },
    });

    const r = await getRoute(A, B);
    expect(r.fallback).toBe(true); // function error => default transport throws => fallback
    expect(r.path).toHaveLength(2);
  });
});

describe('getPathRoute (whole-tour multi-leg road route, REQ-F2-001)', () => {
  const P = [
    { lat: 37.50, lng: 127.0 },
    { lat: 37.51, lng: 127.0 },
    { lat: 37.52, lng: 127.0 },
  ];

  it('concatenates leg paths, dropping the shared junction point', async () => {
    // Two legs: A->B (3 pts) and B->C (3 pts). Junction (B's last == C's first)
    // is dropped, so the combined path is 3 + (3-1) = 5 points.
    const fetchRoute = vi
      .fn()
      .mockResolvedValueOnce({
        path: [P[0], { lat: 37.505, lng: 127.0 }, P[1]],
        distanceM: 1000,
        durationSec: 300,
        fallback: false,
      } as RouteResult)
      .mockResolvedValueOnce({
        path: [P[1], { lat: 37.515, lng: 127.0 }, P[2]],
        distanceM: 1200,
        durationSec: 360,
        fallback: false,
      } as RouteResult);

    const r = await getPathRoute(P, { fetchRoute, mode: 'car' });

    expect(fetchRoute).toHaveBeenCalledTimes(2);
    expect(r.path).toHaveLength(5);
    expect(r.path[0]).toEqual(P[0]);
    expect(r.path[r.path.length - 1]).toEqual(P[2]);
    expect(r.distanceM).toBe(2200);
    expect(r.durationSec).toBe(660);
    expect(r.fallback).toBe(false);
    expect(r.mode).toBe('car');
    // Per-segment geometry is preserved so the map can color each leg.
    expect(r.legPaths).toHaveLength(2);
    expect(r.legPaths?.[0]?.[0]).toEqual(P[0]);
    expect(r.legPaths?.[1]?.[r.legPaths[1].length - 1]).toEqual(P[2]);
  });

  it('marks the whole route as fallback if any leg fell back to a straight line', async () => {
    const fetchRoute = vi
      .fn()
      .mockResolvedValueOnce({
        path: [P[0], P[1]],
        distanceM: 1000,
        durationSec: 300,
        fallback: false,
      } as RouteResult)
      // Too-short path -> getRoute applies its straight-line fallback.
      .mockResolvedValueOnce({
        path: [P[1]],
        distanceM: 0,
        durationSec: 0,
        fallback: false,
      } as RouteResult);

    const r = await getPathRoute(P, { fetchRoute });
    expect(r.fallback).toBe(true);
  });

  it('returns a trivial result for fewer than two points', async () => {
    const fetchRoute = vi.fn();
    const r = await getPathRoute([P[0]], { fetchRoute });
    expect(fetchRoute).not.toHaveBeenCalled();
    expect(r.path).toEqual([P[0]]);
    expect(r.distanceM).toBe(0);
  });
});
