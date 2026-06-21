import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Spot, SpotSettlement, TourMember } from '../../types/database';
import SettlementModal from './SettlementModal';

const spot: Spot = {
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
};

function member(userId: string): TourMember {
  return {
    id: `m-${userId}`,
    tour_id: 't1',
    user_id: userId,
    role: 'member',
    joined_at: 'x',
  };
}

const members = [member('u1'), member('u2')];
const profileNames = { u1: '홍길동', u2: '김철수' };

describe('SettlementModal', () => {
  it('renders each member in the 참여자/결제자 sections', () => {
    render(
      <SettlementModal
        spot={spot}
        members={members}
        profileNames={profileNames}
        currentUserId="u1"
        existing={undefined}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Each member appears (once per section -> two occurrences each).
    expect(screen.getAllByText('홍길동')).toHaveLength(2);
    expect(screen.getAllByText('김철수')).toHaveLength(2);
    expect(screen.getByText(/정산 · 성수 베이커리/)).toBeInTheDocument();
  });

  it('save calls onSave with the chosen amount/payers/participants', async () => {
    const onSave = vi.fn();
    render(
      <SettlementModal
        spot={spot}
        members={members}
        profileNames={profileNames}
        currentUserId="u1"
        existing={undefined}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Default: all participants checked, current user (u1) is the single payer.
    await userEvent.type(screen.getByTestId('settlement-amount'), '12000');
    await userEvent.click(screen.getByTestId('settlement-save'));
    expect(onSave).toHaveBeenCalledWith({
      amount: 12000,
      payerIds: ['u1'],
      participantIds: ['u1', 'u2'],
      settledIds: [],
    });
  });

  it('payer is single-select: choosing a second payer replaces the first', async () => {
    const onSave = vi.fn();
    render(
      <SettlementModal
        spot={spot}
        members={members}
        profileNames={profileNames}
        currentUserId="u1"
        existing={undefined}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Two radios (one per member) within the 결제자 section.
    const payerRadios = screen.getAllByRole('radio');
    expect(payerRadios).toHaveLength(2);
    // u1 (홍길동) is the default payer; select u2 (김철수) -> replaces u1.
    await userEvent.click(payerRadios[1]);
    expect(payerRadios[1]).toBeChecked();
    expect(payerRadios[0]).not.toBeChecked();

    await userEvent.type(screen.getByTestId('settlement-amount'), '12000');
    await userEvent.click(screen.getByTestId('settlement-save'));
    expect(onSave).toHaveBeenCalledWith({
      amount: 12000,
      payerIds: ['u2'],
      participantIds: ['u1', 'u2'],
      settledIds: [],
    });
  });

  it('toggling a 보냄 checkbox includes that ower in settledIds on save', async () => {
    const onSave = vi.fn();
    render(
      <SettlementModal
        spot={spot}
        members={members}
        profileNames={profileNames}
        currentUserId="u1"
        existing={undefined}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // u1 is payer; u2 is the only ower -> only u2 has a 보냄 checkbox.
    await userEvent.type(screen.getByTestId('settlement-amount'), '12000');
    await userEvent.click(screen.getByTestId('settlement-sent-u2'));
    // No 보냄 checkbox for the payer (u1) — the payer is never settled.
    expect(screen.queryByTestId('settlement-sent-u1')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('settlement-save'));
    expect(onSave).toHaveBeenCalledWith({
      amount: 12000,
      payerIds: ['u1'],
      participantIds: ['u1', 'u2'],
      settledIds: ['u2'],
    });
  });

  it('disables 저장 until amount > 0 and a payer + participant are selected', async () => {
    render(
      <SettlementModal
        spot={spot}
        members={members}
        profileNames={profileNames}
        currentUserId="u1"
        existing={undefined}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Amount empty -> disabled.
    expect(screen.getByTestId('settlement-save')).toBeDisabled();
    await userEvent.type(screen.getByTestId('settlement-amount'), '5000');
    expect(screen.getByTestId('settlement-save')).toBeEnabled();
  });

  it('shows 삭제 only when editing an existing settlement', () => {
    const existing: SpotSettlement = {
      id: 'se1',
      spot_id: 's1',
      tour_id: 't1',
      amount: 12000,
      payer_ids: ['u1'],
      participant_ids: ['u1', 'u2'],
      settled_ids: [],
      created_by: 'u1',
      created_at: 'x',
      updated_at: 'x',
    };
    const { rerender } = render(
      <SettlementModal
        spot={spot}
        members={members}
        profileNames={profileNames}
        currentUserId="u1"
        existing={undefined}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('settlement-delete')).not.toBeInTheDocument();

    rerender(
      <SettlementModal
        spot={spot}
        members={members}
        profileNames={profileNames}
        currentUserId="u1"
        existing={existing}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('settlement-delete')).toBeInTheDocument();
  });

  it('delete calls onDelete', async () => {
    const onDelete = vi.fn();
    const existing: SpotSettlement = {
      id: 'se1',
      spot_id: 's1',
      tour_id: 't1',
      amount: 12000,
      payer_ids: ['u1'],
      participant_ids: ['u1', 'u2'],
      settled_ids: [],
      created_by: 'u1',
      created_at: 'x',
      updated_at: 'x',
    };
    render(
      <SettlementModal
        spot={spot}
        members={members}
        profileNames={profileNames}
        currentUserId="u1"
        existing={existing}
        onSave={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('settlement-delete'));
    expect(onDelete).toHaveBeenCalled();
  });

  it('pre-checks 보냄 from existing settled_ids and preserves it on save', async () => {
    const onSave = vi.fn();
    const existing: SpotSettlement = {
      id: 'se1',
      spot_id: 's1',
      tour_id: 't1',
      amount: 12000,
      payer_ids: ['u1'],
      participant_ids: ['u1', 'u2'],
      settled_ids: ['u2'],
      created_by: 'u1',
      created_at: 'x',
      updated_at: 'x',
    };
    render(
      <SettlementModal
        spot={spot}
        members={members}
        profileNames={profileNames}
        currentUserId="u1"
        existing={existing}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // u2 is the only ower and was already settled -> its 보냄 box is pre-checked.
    expect(screen.getByTestId('settlement-sent-u2')).toBeChecked();
    await userEvent.click(screen.getByTestId('settlement-save'));
    expect(onSave).toHaveBeenCalledWith({
      amount: 12000,
      payerIds: ['u1'],
      participantIds: ['u1', 'u2'],
      settledIds: ['u2'],
    });
  });
});
