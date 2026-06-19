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
