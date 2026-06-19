import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Spot } from '../../types/database';
import { useGeoStamp } from './useGeoStamp';

// --- navigator.geolocation mock -----------------------------------------
// We capture the watchPosition success/error callbacks so the test can feed
// synthetic position samples and drive the dwell/accuracy/overlap logic.
interface Coords {
  latitude: number;
  longitude: number;
  accuracy: number;
}
type SuccessCb = (pos: { coords: Coords; timestamp: number }) => void;
type ErrorCb = (err: { code: number; message: string }) => void;

function makeGeolocation() {
  let success: SuccessCb | null = null;
  let error: ErrorCb | null = null;
  const clearWatch = vi.fn();
  const watchPosition = vi.fn((s: SuccessCb, e: ErrorCb) => {
    success = s;
    error = e;
    return 1; // watch id
  });
  return {
    geo: { watchPosition, clearWatch } as unknown as Geolocation,
    emit(coords: Coords, timestamp: number) {
      success?.({ coords, timestamp });
    },
    fail(code: number, message: string) {
      error?.({ code, message });
    },
    watchPosition,
    clearWatch,
  };
}

function spot(p: Partial<Spot> & Pick<Spot, 'id'>): Spot {
  return {
    tour_id: 't1',
    name: p.id,
    kind: 'bakery',
    lat: 37.5,
    lng: 127.0,
    radius_m: 50,
    order_index: 1,
    created_at: 'x',
    updated_at: 'x',
    ...p,
  } as Spot;
}

const A = spot({ id: 'A', lat: 37.5, lng: 127.0, radius_m: 50, order_index: 1 });
const B = spot({ id: 'B', lat: 37.5001, lng: 127.0, radius_m: 50, order_index: 2 });

let gl: ReturnType<typeof makeGeolocation>;
let onStamp: ReturnType<typeof vi.fn>;

beforeEach(() => {
  gl = makeGeolocation();
  onStamp = vi.fn().mockResolvedValue(undefined);
});

function baseOpts(over: Record<string, unknown> = {}) {
  return {
    spots: [A, B],
    stampedSpotIds: new Set<string>(),
    onStamp,
    geolocation: gl.geo,
    isSecureContext: true,
    // Tight dwell config so 2 consecutive in-radius samples => arrival.
    dwellConfig: { minConsecutive: 2, minDwellMs: 1_000_000 },
    ...over,
  };
}

describe('useGeoStamp secure-context guard (NFR-GEO-003 / AC-NFR-GEO-02)', () => {
  it('refuses to start tracking outside a secure context', () => {
    const { result } = renderHook(() =>
      useGeoStamp(baseOpts({ isSecureContext: false })),
    );
    act(() => result.current.start());
    expect(result.current.tracking).toBe(false);
    expect(result.current.error).toMatch(/HTTPS|보안/);
    expect(gl.watchPosition).not.toHaveBeenCalled();
  });
});

describe('useGeoStamp permission purpose flow (NFR-GEO-001 / AC-NFR-GEO-03)', () => {
  it('exposes the auto-stamp purpose prompt before tracking begins', () => {
    const { result } = renderHook(() => useGeoStamp(baseOpts()));
    // Before start, no watch is active and the purpose must be available to show.
    expect(result.current.tracking).toBe(false);
    expect(result.current.purpose).toMatch(/스탬프/);
    expect(gl.watchPosition).not.toHaveBeenCalled();
  });
});

describe('useGeoStamp dwell-time gate (REQ-F1-002 / A9 / AC-F1-01)', () => {
  it('requires the dwell condition before producing a stamp', async () => {
    const { result } = renderHook(() => useGeoStamp(baseOpts()));
    act(() => result.current.start());
    expect(gl.watchPosition).toHaveBeenCalled();

    // One in-radius sample: not enough (needs 2 consecutive).
    act(() => gl.emit({ latitude: 37.5, longitude: 127.0, accuracy: 5 }, 1000));
    expect(onStamp).not.toHaveBeenCalled();

    // Second consecutive in-radius sample => arrival => stamp A.
    act(() => gl.emit({ latitude: 37.5, longitude: 127.0, accuracy: 5 }, 1500));
    await waitFor(() => expect(onStamp).toHaveBeenCalledWith('A'));
  });
});

describe('useGeoStamp accuracy gate (REQ-F1-006 / A10 / AC-F1-03)', () => {
  it('holds the stamp and warns when accuracy >= radius * 0.5', async () => {
    const { result } = renderHook(() => useGeoStamp(baseOpts()));
    act(() => result.current.start());

    // accuracy 30 >= 25 threshold (radius 50): hold + warn, no stamp.
    act(() => gl.emit({ latitude: 37.5, longitude: 127.0, accuracy: 30 }, 1000));
    act(() => gl.emit({ latitude: 37.5, longitude: 127.0, accuracy: 30 }, 1500));

    await waitFor(() => expect(result.current.accuracyWarning).toBe(true));
    expect(onStamp).not.toHaveBeenCalled();
  });
});

describe('useGeoStamp overlap resolution (REQ-F1-008 / AC-F1-05)', () => {
  it('stamps only the earliest unvisited spot from an overlapping position', async () => {
    const { result } = renderHook(() => useGeoStamp(baseOpts()));
    act(() => result.current.start());
    // Point inside both A and B radii; A has earlier order_index.
    act(() => gl.emit({ latitude: 37.50005, longitude: 127.0, accuracy: 5 }, 1000));
    act(() => gl.emit({ latitude: 37.50005, longitude: 127.0, accuracy: 5 }, 1500));
    await waitFor(() => expect(onStamp).toHaveBeenCalledTimes(1));
    expect(onStamp).toHaveBeenCalledWith('A');
  });

  it('skips an already-stamped spot and stamps the next one', async () => {
    const { result } = renderHook(() =>
      useGeoStamp(baseOpts({ stampedSpotIds: new Set(['A']) })),
    );
    act(() => result.current.start());
    act(() => gl.emit({ latitude: 37.50005, longitude: 127.0, accuracy: 5 }, 1000));
    act(() => gl.emit({ latitude: 37.50005, longitude: 127.0, accuracy: 5 }, 1500));
    await waitFor(() => expect(onStamp).toHaveBeenCalledWith('B'));
  });
});

describe('useGeoStamp permission-denied fallback (NFR-GEO-002 / AC-NFR-GEO-01)', () => {
  it('disables auto-stamp and surfaces an error on permission denied', async () => {
    const { result } = renderHook(() => useGeoStamp(baseOpts()));
    act(() => result.current.start());
    act(() => gl.fail(1, 'User denied Geolocation')); // code 1 = PERMISSION_DENIED
    await waitFor(() => expect(result.current.tracking).toBe(false));
    expect(result.current.permissionDenied).toBe(true);
    expect(onStamp).not.toHaveBeenCalled();
  });
});

describe('useGeoStamp tracking indicator + pause/stop (NFR-GEO-004/005)', () => {
  it('reports tracking=true while watching and stops on pause', () => {
    const { result } = renderHook(() => useGeoStamp(baseOpts()));
    act(() => result.current.start());
    expect(result.current.tracking).toBe(true);

    act(() => result.current.pause());
    expect(result.current.tracking).toBe(false);
    expect(gl.clearWatch).toHaveBeenCalledWith(1);
  });

  it('does not stamp after pause even if a late sample arrives', () => {
    const { result } = renderHook(() => useGeoStamp(baseOpts()));
    act(() => result.current.start());
    act(() => result.current.pause());
    // A late callback after pause must be ignored.
    act(() => gl.emit({ latitude: 37.5, longitude: 127.0, accuracy: 5 }, 1000));
    act(() => gl.emit({ latitude: 37.5, longitude: 127.0, accuracy: 5 }, 1500));
    expect(onStamp).not.toHaveBeenCalled();
  });
});

describe('useGeoStamp no raw-coord persistence (NFR-GEO-006 / A12)', () => {
  it('never passes coordinates to the stamp callback (only spot id)', async () => {
    const { result } = renderHook(() => useGeoStamp(baseOpts()));
    act(() => result.current.start());
    act(() => gl.emit({ latitude: 37.5, longitude: 127.0, accuracy: 5 }, 1000));
    act(() => gl.emit({ latitude: 37.5, longitude: 127.0, accuracy: 5 }, 1500));
    await waitFor(() => expect(onStamp).toHaveBeenCalled());
    // The callback is invoked with a single string spot id and nothing else.
    expect(onStamp.mock.calls[0]).toEqual(['A']);
  });
});

describe('useGeoStamp in-memory currentPosition for routing (C-01 / REQ-F2-003)', () => {
  it('starts with no position and exposes the latest in-memory position while tracking', () => {
    const { result } = renderHook(() => useGeoStamp(baseOpts()));
    // Before any sample there is no known position.
    expect(result.current.currentPosition).toBeNull();

    act(() => result.current.start());
    act(() =>
      gl.emit({ latitude: 37.4999, longitude: 127.0123, accuracy: 8 }, 1000),
    );

    // The latest fix is exposed in-memory (NOT persisted) so directions can
    // route from the user's current location and the map can draw the "내 위치"
    // marker. accuracy (metres) rides along for the map's accuracy circle.
    expect(result.current.currentPosition).toEqual({
      lat: 37.4999,
      lng: 127.0123,
      accuracy: 8,
    });
  });

  it('clears the in-memory position when tracking stops (no lingering coords)', () => {
    const { result } = renderHook(() => useGeoStamp(baseOpts()));
    act(() => result.current.start());
    act(() =>
      gl.emit({ latitude: 37.4999, longitude: 127.0123, accuracy: 8 }, 1000),
    );
    expect(result.current.currentPosition).not.toBeNull();

    act(() => result.current.stop());
    expect(result.current.currentPosition).toBeNull();
  });
});

describe('useGeoStamp duplicate-stamp race window (H-03 / AC-A4)', () => {
  it('does not fire a second onStamp for the same spot before reload completes', async () => {
    // onStamp is async (mimics createStamp + reloadStamps). A second in-radius
    // arrival for the SAME spot before stampedSpotIds is refreshed must NOT
    // trigger a duplicate createStamp. Use a single spot so the only possible
    // target after A is stamped is A itself (isolates the duplicate guard).
    const { result } = renderHook(() => useGeoStamp(baseOpts({ spots: [A] })));
    act(() => result.current.start());

    // First sustained arrival at A => one stamp.
    act(() => gl.emit({ latitude: 37.5, longitude: 127.0, accuracy: 5 }, 1000));
    act(() => gl.emit({ latitude: 37.5, longitude: 127.0, accuracy: 5 }, 1500));
    await waitFor(() => expect(onStamp).toHaveBeenCalledTimes(1));
    expect(onStamp).toHaveBeenCalledWith('A');

    // More in-radius samples for A arrive BEFORE the parent reloads
    // stampedSpotIds (still the empty set). The optimistic guard must suppress
    // a second stamp for A.
    act(() => gl.emit({ latitude: 37.5, longitude: 127.0, accuracy: 5 }, 2000));
    act(() => gl.emit({ latitude: 37.5, longitude: 127.0, accuracy: 5 }, 2500));
    act(() => gl.emit({ latitude: 37.5, longitude: 127.0, accuracy: 5 }, 3000));

    // Give any pending microtasks a chance to flush.
    await Promise.resolve();
    expect(onStamp).toHaveBeenCalledTimes(1);
  });
});
