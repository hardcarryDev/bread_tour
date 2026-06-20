import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Spot } from '../../types/database';
import SpotList from './SpotList';

const spots: Spot[] = [
  {
    id: 's1',
    tour_id: 't1',
    name: '성수 베이커리',
    kind: '빵집',
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
    kind: '음식점',
    lat: 37.561,
    lng: 126.925,
    radius_m: 50,
    order_index: 2,
    created_at: 'x',
    updated_at: 'x',
  },
];

describe('SpotList ordering display (REQ-F1-005 / AC-F1-07)', () => {
  it('lists spots with their visit-order numbers', () => {
    render(<SpotList spots={spots} isOwner={false} onReorder={vi.fn()} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('1');
    expect(items[0]).toHaveTextContent('성수 베이커리');
    expect(items[1]).toHaveTextContent('2');
  });
});

describe('SpotList reorder controls (REQ-F3-003 / AC-F3-02, AC-F5-06)', () => {
  it('moving a spot down calls onReorder with the new id order', async () => {
    const onReorder = vi.fn();
    render(<SpotList spots={spots} isOwner={false} onReorder={onReorder} />);
    // Move the first spot down -> order becomes [s2, s1].
    await userEvent.click(screen.getByRole('button', { name: /아래로.*성수/ }));
    expect(onReorder).toHaveBeenCalledWith(['s2', 's1']);
  });

  it('moving a spot up calls onReorder with the new id order', async () => {
    const onReorder = vi.fn();
    render(<SpotList spots={spots} isOwner={false} onReorder={onReorder} />);
    await userEvent.click(screen.getByRole('button', { name: /위로.*연남/ }));
    expect(onReorder).toHaveBeenCalledWith(['s2', 's1']);
  });

  it('disables move-up on the first spot and move-down on the last', () => {
    render(<SpotList spots={spots} isOwner={false} onReorder={vi.fn()} />);
    expect(screen.getByRole('button', { name: /위로.*성수/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /아래로.*연남/ })).toBeDisabled();
  });
});

describe('SpotList "내기준정렬" local distance sort + caption (Feature)', () => {
  // When a local distance sort is active, the list is ordered by ascending
  // distance (closest first) regardless of order_index, and each row shows a
  // green one-line caption with the selected mode label + distance + time.
  it('orders rows by ascending distance and shows the green caption per row', () => {
    // s1 has order_index 1 but is FARTHER (1500m) than s2 (400m); the local
    // distance sort must put the closer s2 first.
    const distanceBySpot = {
      s1: { distanceM: 1500, durationSec: 540, fallback: false },
      s2: { distanceM: 400, durationSec: 300, fallback: false },
    };
    render(
      <SpotList
        spots={spots}
        isOwner={false}
        onReorder={vi.fn()}
        sortMode="transit"
        distanceBySpot={distanceBySpot}
      />,
    );
    const items = screen.getAllByRole('listitem');
    // Closest first: s2 (연남 식당, 400m) before s1 (성수 베이커리, 1500m).
    expect(items[0]).toHaveTextContent('연남 식당');
    expect(items[1]).toHaveTextContent('성수 베이커리');

    // Each row shows a green caption with the selected mode label (대중교통),
    // formatted distance, and time.
    const captions = screen.getAllByTestId('spot-distance');
    expect(captions).toHaveLength(2);
    expect(captions[0]).toHaveTextContent('대중교통 기준 거리: 400m 예상 시간: 5분');
    expect(captions[1]).toHaveTextContent('대중교통 기준 거리: 1.5km 예상 시간: 9분');
  });

  it('uses the 도보 mode label when sortMode is walk', () => {
    render(
      <SpotList
        spots={spots}
        isOwner={false}
        onReorder={vi.fn()}
        sortMode="walk"
        distanceBySpot={{
          s1: { distanceM: 200, durationSec: 180, fallback: false },
          s2: { distanceM: 900, durationSec: 720, fallback: false },
        }}
      />,
    );
    const captions = screen.getAllByTestId('spot-distance');
    expect(captions[0]).toHaveTextContent('도보 기준');
  });

  it('uses the 자동차 mode label when sortMode is car', () => {
    render(
      <SpotList
        spots={spots}
        isOwner={false}
        onReorder={vi.fn()}
        sortMode="car"
        distanceBySpot={{
          s1: { distanceM: 200, durationSec: 180, fallback: false },
          s2: { distanceM: 900, durationSec: 720, fallback: false },
        }}
      />,
    );
    expect(screen.getAllByTestId('spot-distance')[0]).toHaveTextContent(
      '자동차 기준',
    );
  });

  it('sorts spots with no route result last and shows a subtle failure note', () => {
    render(
      <SpotList
        spots={spots}
        isOwner={false}
        onReorder={vi.fn()}
        sortMode="car"
        distanceBySpot={{
          s1: { distanceM: 1500, durationSec: 540, fallback: false },
          s2: null, // route failed -> sorts last, no caption
        }}
      />,
    );
    const items = screen.getAllByRole('listitem');
    // s1 (has distance) before s2 (failed) regardless of order_index.
    expect(items[0]).toHaveTextContent('성수 베이커리');
    expect(items[1]).toHaveTextContent('연남 식당');
    // Only the spot with a result shows the green caption.
    expect(screen.getAllByTestId('spot-distance')).toHaveLength(1);
    // The failed spot shows a subtle failure note instead.
    expect(screen.getByText('거리 계산 실패')).toBeInTheDocument();
  });

  it('falls back to order_index ordering and no captions when no sort is active', () => {
    render(<SpotList spots={spots} isOwner={false} onReorder={vi.fn()} />);
    const items = screen.getAllByRole('listitem');
    // Plan order preserved: s1 (order 1) then s2 (order 2).
    expect(items[0]).toHaveTextContent('성수 베이커리');
    expect(items[1]).toHaveTextContent('연남 식당');
    expect(screen.queryByTestId('spot-distance')).not.toBeInTheDocument();
  });

  it('reorder arrows still operate on the real plan order while a local sort is active', async () => {
    // Even when displayed by distance, the up/down arrows move spots in the
    // shared plan order (order_index), not the displayed distance order.
    const onReorder = vi.fn();
    render(
      <SpotList
        spots={spots}
        isOwner={false}
        onReorder={onReorder}
        sortMode="car"
        distanceBySpot={{
          s1: { distanceM: 1500, durationSec: 540, fallback: false },
          s2: { distanceM: 400, durationSec: 300, fallback: false },
        }}
      />,
    );
    // Displayed order is [s2, s1] (by distance). Moving 성수 베이커리 (s1) up in
    // the PLAN order yields [s1, s2] -> but s1 is already plan-first, so use
    // 연남 식당 (s2): move it up in plan order -> [s2, s1].
    await userEvent.click(screen.getByRole('button', { name: /위로.*연남/ }));
    expect(onReorder).toHaveBeenCalledWith(['s2', 's1']);
  });
});

describe('SpotList delete control (owner only, REQ-F6-007)', () => {
  it('shows a delete button for the owner and calls onDelete', async () => {
    const onDelete = vi.fn();
    render(
      <SpotList
        spots={spots}
        isOwner
        onReorder={vi.fn()}
        onDelete={onDelete}
      />,
    );
    const delButtons = screen.getAllByRole('button', { name: /삭제/ });
    await userEvent.click(delButtons[0]);
    expect(onDelete).toHaveBeenCalledWith('s1');
  });

  it('hides delete controls from a non-owner member (AC-F6-06)', () => {
    render(<SpotList spots={spots} isOwner={false} onReorder={vi.fn()} />);
    expect(
      screen.queryByRole('button', { name: /삭제/ }),
    ).not.toBeInTheDocument();
  });
});
