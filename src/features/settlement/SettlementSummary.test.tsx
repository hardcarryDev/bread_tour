import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SpotSettlement } from '../../types/database';
import SettlementSummary from './SettlementSummary';

function row(partial: Partial<SpotSettlement> & Pick<SpotSettlement, 'id'>): SpotSettlement {
  return {
    spot_id: 's1',
    tour_id: 't1',
    amount: 12000,
    payer_ids: ['u1'],
    participant_ids: ['u1', 'u2', 'u3'],
    created_by: 'u1',
    created_at: 'x',
    updated_at: 'x',
    ...partial,
  } as SpotSettlement;
}

const profileNames = { u1: '홍길동', u2: '김철수', u3: '이영희' };

describe('SettlementSummary', () => {
  it('renders nothing when there are no settlements', () => {
    const { container } = render(
      <SettlementSummary settlements={[]} profileNames={profileNames} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows each member net and the suggested transfers', () => {
    // 12,000 paid by u1, split 3 ways (4,000 each):
    // u1 +8000, u2 −4000, u3 −4000.
    render(
      <SettlementSummary
        settlements={[row({ id: 'se1' })]}
        profileNames={profileNames}
      />,
    );
    expect(screen.getByText('정산 요약')).toBeInTheDocument();
    // Net lines (sign-aware).
    expect(screen.getByText('+8,000원')).toBeInTheDocument();
    expect(screen.getAllByText('−4,000원')).toHaveLength(2);
    // Suggested transfers: u2 -> u1 and u3 -> u1, each 4,000원.
    expect(
      screen.getByText('김철수 → 홍길동: 4,000원'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('이영희 → 홍길동: 4,000원'),
    ).toBeInTheDocument();
  });
});
