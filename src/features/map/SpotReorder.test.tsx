import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Spot } from '../../types/database';
import SpotReorder, { computeBlockReorder } from './SpotReorder';

function spot(id: string, order: number): Spot {
  return {
    id,
    tour_id: 't1',
    name: `장소${id}`,
    kind: '빵집',
    lat: 0,
    lng: 0,
    radius_m: 50,
    order_index: order,
    created_at: 'x',
    updated_at: 'x',
  };
}

describe('computeBlockReorder (multi-row block move)', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('moves a single row down to a gap', () => {
    // Move 'a' to the gap before 'd' (index 3): [b, c, a, d].
    expect(computeBlockReorder(order, ['a'], 3)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves a single row up to the top', () => {
    expect(computeBlockReorder(order, ['c'], 0)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('moves a contiguous block as one unit preserving its order', () => {
    // Move [a, b] to the end (gap 4): [c, d, a, b].
    expect(computeBlockReorder(order, ['a', 'b'], 4)).toEqual([
      'c',
      'd',
      'a',
      'b',
    ]);
  });

  it('moves a non-contiguous selection into a block, keeping relative order', () => {
    // Select a + c, drop before 'd' (gap 3): rest=[b,d]; two moving items (a,c)
    // sit before the gap -> insertAt = 3-2 = 1 -> b stays, block [a,c], then d.
    expect(computeBlockReorder(order, ['a', 'c'], 3)).toEqual([
      'b',
      'a',
      'c',
      'd',
    ]);
  });

  it('is a no-op when dropped at its own position', () => {
    expect(computeBlockReorder(order, ['b'], 1)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('clamps an out-of-range drop index to the end', () => {
    expect(computeBlockReorder(order, ['a'], 99)).toEqual(['b', 'c', 'd', 'a']);
  });
});

describe('SpotReorder component wiring', () => {
  const spots = [spot('s1', 1), spot('s2', 2), spot('s3', 3)];

  it('renders rows in plan order with a selection circle and drag handle', () => {
    render(<SpotReorder spots={spots} onApply={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('reorder-select-s1')).toBeInTheDocument();
    expect(screen.getByTestId('reorder-handle-s1')).toBeInTheDocument();
    const checks = screen.getAllByRole('checkbox');
    expect(checks).toHaveLength(3);
  });

  it('toggles selection on the circle', async () => {
    render(<SpotReorder spots={spots} onApply={vi.fn()} onCancel={vi.fn()} />);
    const c = screen.getByTestId('reorder-select-s2');
    expect(c).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(c);
    expect(c).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(c);
    expect(c).toHaveAttribute('aria-checked', 'false');
  });

  it('확인 applies the current draft order ids', async () => {
    const onApply = vi.fn();
    render(<SpotReorder spots={spots} onApply={onApply} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByTestId('reorder-apply'));
    expect(onApply).toHaveBeenCalledWith(['s1', 's2', 's3']);
  });

  it('취소 calls onCancel without applying', async () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    render(<SpotReorder spots={spots} onApply={onApply} onCancel={onCancel} />);
    await userEvent.click(screen.getByTestId('reorder-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});
