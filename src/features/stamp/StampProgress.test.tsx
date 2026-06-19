import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Spot } from '../../types/database';
import StampProgress from './StampProgress';
import type { StampStatus } from './api';

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
  spot({ id: 's1', name: '성수 베이커리', order_index: 1 }),
  spot({ id: 's2', name: '연남 식당', order_index: 2 }),
  spot({ id: 's3', name: '망원 빵집', order_index: 3 }),
];

describe('StampProgress visit-order status (REQ-F1-005 / AC-F1-07)', () => {
  it('lists every spot in visit order with stamp status + arrival time', () => {
    const stampBySpot: Record<string, StampStatus> = {
      s1: {
        stamped: true,
        arrivedAt: '2026-06-19T01:23:00Z',
        stampId: 'st1',
        userId: 'me',
      },
    };
    render(
      <StampProgress
        spots={spots}
        stampBySpot={stampBySpot}
        currentUserId="me"
        isOwner={false}
        onCancel={vi.fn()}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    // First spot is stamped and shows an arrival time.
    expect(items[0]).toHaveTextContent('성수 베이커리');
    expect(items[0]).toHaveTextContent('획득');
    // Un-stamped spots show as not yet acquired.
    expect(items[1]).toHaveTextContent('미획득');
  });
});

describe('StampProgress cancel permission gating (REQ-F1-009/010 / AC-F1-08/09)', () => {
  it('offers cancel for the stamp owner', () => {
    const onCancel = vi.fn();
    render(
      <StampProgress
        spots={spots}
        stampBySpot={{
          s1: { stamped: true, arrivedAt: 'x', stampId: 'st1', userId: 'me' },
        }}
        currentUserId="me"
        isOwner={false}
        onCancel={onCancel}
      />,
    );
    expect(
      screen.getByRole('button', { name: /스탬프 취소: 성수 베이커리/ }),
    ).toBeInTheDocument();
  });

  it('offers cancel to the tour owner even for another member stamp', () => {
    render(
      <StampProgress
        spots={spots}
        stampBySpot={{
          s1: { stamped: true, arrivedAt: 'x', stampId: 'st1', userId: 'other' },
        }}
        currentUserId="me"
        isOwner={true}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /스탬프 취소: 성수 베이커리/ }),
    ).toBeInTheDocument();
  });

  it('does NOT offer cancel to an unpermitted member (not owner, not stamp owner)', () => {
    render(
      <StampProgress
        spots={spots}
        stampBySpot={{
          s1: { stamped: true, arrivedAt: 'x', stampId: 'st1', userId: 'other' },
        }}
        currentUserId="me"
        isOwner={false}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /스탬프 취소/ }),
    ).not.toBeInTheDocument();
  });

  it('invokes onCancel with the stamp id when the owner cancels', async () => {
    const onCancel = vi.fn();
    render(
      <StampProgress
        spots={spots}
        stampBySpot={{
          s1: { stamped: true, arrivedAt: 'x', stampId: 'st1', userId: 'me' },
        }}
        currentUserId="me"
        isOwner={false}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /스탬프 취소: 성수 베이커리/ }),
    );
    expect(onCancel).toHaveBeenCalledWith('st1');
  });
});
