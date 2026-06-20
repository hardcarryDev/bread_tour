import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Kakao SDK mock ------------------------------------------------------
// We capture the map 'click' handler so the test can simulate a user tapping
// the map, and we stub services.Places().keywordSearch with canned results so
// keyword search can be exercised without the real SDK.
interface FakeMarker {
  position: { lat: number; lng: number };
  setPosition: ReturnType<typeof vi.fn>;
  setMap: ReturnType<typeof vi.fn>;
}

const captured = {
  mapClickHandlers: [] as Array<(e: { latLng: KakaoLatLng }) => void>,
  markers: [] as FakeMarker[],
  setCenterCalls: [] as Array<{ lat: number; lng: number }>,
  infoWindowContent: [] as string[],
  infoWindowOpenCount: 0,
};

// Canned place-search results returned by keywordSearch.
let searchResults: Array<{
  place_name: string;
  x: string; // lng
  y: string; // lat
  category_name?: string;
  road_address_name?: string;
  address_name?: string;
  phone?: string;
  place_url?: string;
}> = [];
let searchStatus = 'OK';

function makeLatLng(lat: number, lng: number): KakaoLatLng {
  return { getLat: () => lat, getLng: () => lng } as KakaoLatLng;
}

function makeKakao(): KakaoNamespace {
  const maps = {
    LatLng: vi.fn(function (
      this: { lat: number; lng: number },
      lat: number,
      lng: number,
    ) {
      this.lat = lat;
      this.lng = lng;
      (this as unknown as KakaoLatLng).getLat = () => lat;
      (this as unknown as KakaoLatLng).getLng = () => lng;
    }) as unknown as KakaoMaps['LatLng'],
    LatLngBounds: vi.fn(() => ({ extend: vi.fn() })),
    Map: vi.fn(() => ({
      setBounds: vi.fn(),
      setCenter: vi.fn((latlng: KakaoLatLng) => {
        captured.setCenterCalls.push({
          lat: latlng.getLat(),
          lng: latlng.getLng(),
        });
      }),
      relayout: vi.fn(),
    })),
    Marker: vi.fn((opts: { position: { lat: number; lng: number } }) => {
      const marker: FakeMarker = {
        position: opts.position,
        setPosition: vi.fn((p: { lat: number; lng: number }) => {
          marker.position = p;
        }),
        setMap: vi.fn(),
      };
      captured.markers.push(marker);
      return marker;
    }),
    InfoWindow: vi.fn(() => ({
      setContent: vi.fn((content: string) => {
        captured.infoWindowContent.push(content);
      }),
      open: vi.fn(() => {
        captured.infoWindowOpenCount += 1;
      }),
      close: vi.fn(),
    })),
    event: {
      addListener: vi.fn(
        (_target: unknown, type: string, cb: (e: unknown) => void) => {
          if (type === 'click') {
            captured.mapClickHandlers.push(
              cb as (e: { latLng: KakaoLatLng }) => void,
            );
          }
        },
      ),
    },
    services: {
      status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT', ERROR: 'ERROR' },
      Places: vi.fn(() => ({
        keywordSearch: (
          _keyword: string,
          cb: (data: unknown[], status: string) => void,
        ) => {
          cb(searchResults, searchStatus);
        },
      })),
    },
    load: (cb: () => void) => cb(),
  };
  return { maps } as unknown as KakaoNamespace;
}

const loadKakaoMaps = vi.fn();
vi.mock('../../lib/kakao', () => ({
  loadKakaoMaps: (...a: unknown[]) => loadKakaoMaps(...a),
}));

import LocationPicker from './LocationPicker';

beforeEach(() => {
  vi.clearAllMocks();
  captured.mapClickHandlers = [];
  captured.markers = [];
  captured.setCenterCalls = [];
  captured.infoWindowContent = [];
  captured.infoWindowOpenCount = 0;
  searchResults = [];
  searchStatus = 'OK';
  loadKakaoMaps.mockResolvedValue(makeKakao());
});

describe('LocationPicker click-to-pin (A8)', () => {
  it('captures the coordinate when the user clicks the map and confirms', async () => {
    const onConfirm = vi.fn();
    render(<LocationPicker onConfirm={onConfirm} onCancel={vi.fn()} />);

    await waitFor(() => expect(captured.mapClickHandlers.length).toBe(1));

    // Simulate a Kakao map click at a real coordinate (not Seoul City Hall).
    act(() =>
      captured.mapClickHandlers[0]({ latLng: makeLatLng(36.3275, 127.4276) }),
    );

    // The picked coordinate is shown and confirm is now enabled.
    expect(await screen.findByTestId('picker-coord')).toHaveTextContent(
      '36.32750, 127.42760',
    );

    await userEvent.click(screen.getByTestId('picker-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toMatchObject({
      lat: 36.3275,
      lng: 127.4276,
    });
  });

  it('moves the marker to the latest clicked position', async () => {
    render(<LocationPicker onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(captured.mapClickHandlers.length).toBe(1));

    act(() =>
      captured.mapClickHandlers[0]({ latLng: makeLatLng(36.1, 127.1) }),
    );
    act(() =>
      captured.mapClickHandlers[0]({ latLng: makeLatLng(35.2, 128.2) }),
    );

    expect(screen.getByTestId('picker-coord')).toHaveTextContent(
      '35.20000, 128.20000',
    );
  });
});

describe('LocationPicker keyword search (A8 place search)', () => {
  it('lists results and sets the coordinate + name when one is selected', async () => {
    searchResults = [
      { place_name: '성심당 본점', x: '127.4276', y: '36.3275' },
      { place_name: '성심당 대전역점', x: '127.4321', y: '36.3318' },
    ];
    const onConfirm = vi.fn();
    render(<LocationPicker onConfirm={onConfirm} onCancel={vi.fn()} />);
    await waitFor(() => expect(captured.mapClickHandlers.length).toBe(1));

    await userEvent.type(screen.getByTestId('picker-search-input'), '성심당');
    await userEvent.click(screen.getByTestId('picker-search-submit'));

    // Results render and are selectable.
    const first = await screen.findByText('성심당 본점');
    await userEvent.click(first);

    expect(screen.getByTestId('picker-coord')).toHaveTextContent(
      '36.32750, 127.42760',
    );

    await userEvent.click(screen.getByTestId('picker-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: 36.3275,
        lng: 127.4276,
        name: '성심당 본점',
      }),
    );
  });

  it('opens an info bubble with place details when a result is selected', async () => {
    searchResults = [
      {
        place_name: '성심당 본점',
        x: '127.4276',
        y: '36.3275',
        category_name: '음식점 > 베이커리',
        road_address_name: '대전 중구 대종로480번길 15',
        phone: '042-229-5302',
        place_url: 'http://place.map.kakao.com/123',
      },
    ];
    render(<LocationPicker onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(captured.mapClickHandlers.length).toBe(1));

    await userEvent.type(screen.getByTestId('picker-search-input'), '성심당');
    await userEvent.click(screen.getByTestId('picker-search-submit'));
    await userEvent.click(await screen.findByText('성심당 본점'));

    expect(captured.infoWindowOpenCount).toBe(1);
    const content = captured.infoWindowContent.at(-1) ?? '';
    expect(content).toContain('성심당 본점');
    expect(content).toContain('음식점 &gt; 베이커리'); // HTML-escaped
    expect(content).toContain('대전 중구 대종로480번길 15');
    expect(content).toContain('042-229-5302');
    expect(content).toContain('http://place.map.kakao.com/123');
    expect(content).toContain('상세보기');
  });

  it('shows a no-results message when the search returns nothing', async () => {
    searchResults = [];
    searchStatus = 'ZERO_RESULT';
    render(<LocationPicker onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(captured.mapClickHandlers.length).toBe(1));

    await userEvent.type(screen.getByTestId('picker-search-input'), '없는곳');
    await userEvent.click(screen.getByTestId('picker-search-submit'));

    expect(await screen.findByText(/검색 결과가 없습니다/)).toBeInTheDocument();
  });
});

describe('LocationPicker confirm gating + cancel', () => {
  it('disables confirm until a coordinate is chosen', async () => {
    render(<LocationPicker onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(captured.mapClickHandlers.length).toBe(1));
    expect(screen.getByTestId('picker-confirm')).toBeDisabled();
  });

  it('calls onCancel without confirming when cancelled', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<LocationPicker onConfirm={onConfirm} onCancel={onCancel} />);
    await waitFor(() => expect(captured.mapClickHandlers.length).toBe(1));

    await userEvent.click(screen.getByTestId('picker-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('LocationPicker SDK load failure (graceful)', () => {
  it('shows an error and still allows cancel when the SDK fails', async () => {
    loadKakaoMaps.mockRejectedValue(new Error('sdk down'));
    const onCancel = vi.fn();
    render(<LocationPicker onConfirm={vi.fn()} onCancel={onCancel} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/지도/);
    await userEvent.click(screen.getByTestId('picker-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
