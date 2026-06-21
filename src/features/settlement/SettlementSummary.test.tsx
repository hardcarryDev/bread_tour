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
    settled_ids: [],
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

  it('excludes settled owers from totals and the 보낼 돈 transfer list', () => {
    // Same 12,000 / 3-way split, but u2 (김철수) has already paid u1 back.
    // Outstanding: u1 +4000, u3 −4000, u2 cleared (0). Only u3 -> u1 remains.
    render(
      <SettlementSummary
        settlements={[row({ id: 'se1', settled_ids: ['u2'] })]}
        profileNames={profileNames}
      />,
    );
    // u1 is now only owed one share (4,000), not 8,000.
    expect(screen.getByText('+4,000원')).toBeInTheDocument();
    expect(screen.queryByText('+8,000원')).not.toBeInTheDocument();
    // Only the unsettled ower (u3) shows a negative outstanding.
    expect(screen.getAllByText('−4,000원')).toHaveLength(1);
    // u2 is settled -> no transfer from 김철수; only 이영희 -> 홍길동 remains.
    expect(
      screen.queryByText('김철수 → 홍길동: 4,000원'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('이영희 → 홍길동: 4,000원'),
    ).toBeInTheDocument();
  });

  it('renders nothing when every ower has settled', () => {
    const { container } = render(
      <SettlementSummary
        settlements={[row({ id: 'se1', settled_ids: ['u2', 'u3'] })]}
        profileNames={profileNames}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
