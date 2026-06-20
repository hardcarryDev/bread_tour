import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Kakao SDK mock ------------------------------------------------------
// SpotForm opens LocationPicker, which loads the Kakao SDK. We mock the loader
// and capture the map 'click' handler so the test can simulate the user picking
// a real coordinate on the map (replacing the old hardcoded Seoul pin).
const captured = {
  mapClickHandlers: [] as Array<(e: { latLng: KakaoLatLng }) => void>,
};

function makeLatLng(lat: number, lng: number): KakaoLatLng {
  return { getLat: () => lat, getLng: () => lng } as KakaoLatLng;
}

function makeKakao(): KakaoNamespace {
  const maps = {
    LatLng: vi.fn(function (
      this: KakaoLatLng,
      lat: number,
      lng: number,
    ) {
      this.getLat = () => lat;
      this.getLng = () => lng;
    }) as unknown as KakaoMaps['LatLng'],
    LatLngBounds: vi.fn(() => ({ extend: vi.fn() })),
    Map: vi.fn(() => ({
      setBounds: vi.fn(),
      setCenter: vi.fn(),
      relayout: vi.fn(),
    })),
    Marker: vi.fn(() => ({ setMap: vi.fn(), setPosition: vi.fn() })),
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
      Places: vi.fn(() => ({ keywordSearch: vi.fn() })),
    },
    load: (cb: () => void) => cb(),
  };
  return { maps } as unknown as KakaoNamespace;
}

const loadKakaoMaps = vi.fn();
vi.mock('../../lib/kakao', () => ({
  loadKakaoMaps: (...a: unknown[]) => loadKakaoMaps(...a),
}));

import SpotForm from './SpotForm';

// Open the picker, simulate a map click at the given coordinate, and confirm.
// This drives the real LocationPicker flow end-to-end (A8 click-to-pin).
async function pickLocationOnMap(lat: number, lng: number) {
  await userEvent.click(screen.getByTestId('pin-here'));
  await waitFor(() => expect(captured.mapClickHandlers.length).toBeGreaterThan(0));
  act(() =>
    captured.mapClickHandlers[captured.mapClickHandlers.length - 1]({
      latLng: makeLatLng(lat, lng),
    }),
  );
  await screen.findByTestId('picker-coord');
  await userEvent.click(screen.getByTestId('picker-confirm'));
}

beforeEach(() => {
  vi.clearAllMocks();
  captured.mapClickHandlers = [];
  loadKakaoMaps.mockResolvedValue(makeKakao());
});

describe('SpotForm coordinate capture + menu fields (REQ-F1-001, REQ-F4-001 / AC-F1-06, AC-F4-01)', () => {
  it('submits the coordinate picked on the map, plus name, kind and menu text', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SpotForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/이름/), '성수 베이커리');
    // Interactive picker: tap the map at a real coordinate (not the old
    // hardcoded 37.5665, 126.978 Seoul City Hall pin).
    await pickLocationOnMap(36.3275, 127.4276);
    await userEvent.type(screen.getByLabelText(/추천 메뉴/), '소금빵');
    await userEvent.click(screen.getByRole('button', { name: /저장/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.name).toBe('성수 베이커리');
    expect(arg.lat).toBe(36.3275);
    expect(arg.lng).toBe(127.4276);
    expect(arg.menuText).toBe('소금빵');
  });

  it('submits a custom free-text 종류 (not limited to 빵집/음식점)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SpotForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/이름/), '미뉴트빠삐용');
    const kindField = screen.getByLabelText(/종류/);
    await userEvent.clear(kindField);
    await userEvent.type(kindField, '카페');
    await pickLocationOnMap(36.3275, 127.4276);
    await userEvent.click(screen.getByRole('button', { name: /저장/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].kind).toBe('카페');
  });

  it('allows an empty menu (REQ-F4-004 / AC-F4-03)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SpotForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/이름/), '빵집');
    await pickLocationOnMap(36.1, 127.1);
    await userEvent.click(screen.getByRole('button', { name: /저장/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].menuText).toBe('');
  });

  it('searching in the picker does not submit the form / close the map (nested-form regression)', async () => {
    const onSubmit = vi.fn();
    render(<SpotForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/이름/), '빵집');
    await userEvent.click(screen.getByTestId('pin-here'));
    await waitFor(() =>
      expect(captured.mapClickHandlers.length).toBeGreaterThan(0),
    );

    // Clicking 검색 must run the place search, NOT submit the surrounding
    // SpotForm <form> (which previously closed the picker before searching).
    await userEvent.type(screen.getByTestId('picker-search-input'), '성심당');
    await userEvent.click(screen.getByTestId('picker-search-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    // The picker is still open (the map did not close).
    expect(screen.getByTestId('picker-confirm')).toBeInTheDocument();

    // Pressing Enter in the search box must not submit the outer form either.
    await userEvent.type(screen.getByTestId('picker-search-input'), '{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('picker-confirm')).toBeInTheDocument();
  });

  it('blocks submit until a location is picked', async () => {
    const onSubmit = vi.fn();
    render(<SpotForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/이름/), '빵집');
    await userEvent.click(screen.getByRole('button', { name: /저장/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/위치/);
  });

  it('cancelling the picker does not set a coordinate', async () => {
    render(<SpotForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByTestId('pin-here'));
    await waitFor(() =>
      expect(captured.mapClickHandlers.length).toBeGreaterThan(0),
    );
    await userEvent.click(screen.getByTestId('picker-cancel'));
    expect(screen.queryByTestId('picked-coord')).not.toBeInTheDocument();
  });

  it('prefills fields when editing an existing spot', () => {
    render(
      <SpotForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        initial={{ name: '기존 빵집', lat: 37.5, lng: 127, kind: '음식점' }}
      />,
    );
    expect(screen.getByLabelText(/이름/)).toHaveValue('기존 빵집');
    // 종류 is now a free-text field and reflects the existing value.
    expect(screen.getByLabelText(/종류/)).toHaveValue('음식점');
    // Existing coordinate is shown without opening the picker.
    expect(screen.getByTestId('picked-coord')).toHaveTextContent(
      '37.50000, 127.00000',
    );
  });
});
