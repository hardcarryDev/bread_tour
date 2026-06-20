import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MemberRoster from './MemberRoster';
import type { TourMember } from '../../types/database';

const members: TourMember[] = [
  { id: 'm1', tour_id: 't1', user_id: 'u1', role: 'owner', joined_at: 'x' },
  { id: 'm2', tour_id: 't1', user_id: 'u2', role: 'member', joined_at: 'x' },
  { id: 'm3', tour_id: 't1', user_id: 'u3', role: 'member', joined_at: 'x' },
];

const names = { u1: '김개발', u2: '테스터', u3: '하마정리' };

function renderRoster(overrides: Partial<React.ComponentProps<typeof MemberRoster>> = {}) {
  const onRemoveMember = vi.fn();
  const onInvite = vi.fn();
  render(
    <MemberRoster
      members={members}
      profileNames={names}
      onlineIds={new Set(['u1', 'u2'])}
      isOwner={true}
      inviteLink={null}
      onInvite={onInvite}
      onRemoveMember={onRemoveMember}
      {...overrides}
    />,
  );
  return { onRemoveMember, onInvite };
}

describe('MemberRoster (REQ-F5-003 / REQ-F6-004)', () => {
  it('lists ALL members by display name, not just connected ones', () => {
    renderRoster({ onlineIds: new Set(['u1']) });
    const list = within(screen.getByTestId('member-list'));
    // u3 (하마정리) is offline yet still listed — owner can manage offline members.
    expect(list.getByText('김개발')).toBeInTheDocument();
    expect(list.getByText('테스터')).toBeInTheDocument();
    expect(list.getByText('하마정리')).toBeInTheDocument();
    // Raw UUIDs are never shown.
    expect(screen.queryByText('u3')).not.toBeInTheDocument();
  });

  it('reports the online count from presence', () => {
    renderRoster({ onlineIds: new Set(['u1', 'u2']) });
    expect(screen.getByTestId('online-count')).toHaveTextContent('2');
  });

  it('falls back to a name placeholder when a member has no display name', () => {
    renderRoster({ profileNames: { u1: '김개발', u2: null, u3: null } });
    const list = within(screen.getByTestId('member-list'));
    expect(list.getByText('김개발')).toBeInTheDocument();
    expect(list.getAllByText('(이름 없음)')).toHaveLength(2);
  });

  it('shows the invite button only to the owner', () => {
    const { rerender } = (() => {
      const r = render(
        <MemberRoster
          members={members}
          profileNames={names}
          onlineIds={new Set()}
          isOwner={false}
          inviteLink={null}
          onInvite={vi.fn()}
          onRemoveMember={vi.fn()}
        />,
      );
      return r;
    })();
    expect(
      screen.queryByRole('button', { name: '멤버 초대' }),
    ).not.toBeInTheDocument();
    rerender(
      <MemberRoster
        members={members}
        profileNames={names}
        onlineIds={new Set()}
        isOwner={true}
        inviteLink={null}
        onInvite={vi.fn()}
        onRemoveMember={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: '멤버 초대' }),
    ).toBeInTheDocument();
  });

  describe('owner long-press removal', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('opens a confirm after a long-press and removes on confirm', () => {
      const { onRemoveMember } = renderRoster();
      const target = screen.getByText('테스터'); // u2 (member m2)

      fireEvent.pointerDown(target);
      // Before the threshold, no confirm yet.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_TICK);
      });
      // Confirm dialog is now open for the long-pressed member.
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
      expect(onRemoveMember).toHaveBeenCalledWith('m2');
    });

    it('aborts the long-press if released before the threshold', () => {
      const { onRemoveMember } = renderRoster();
      const target = screen.getByText('테스터');

      fireEvent.pointerDown(target);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      fireEvent.pointerUp(target); // released early
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onRemoveMember).not.toHaveBeenCalled();
    });

    it('does not arm a long-press on the owner row', () => {
      renderRoster();
      const owner = screen.getByText('김개발'); // u1 owner
      fireEvent.pointerDown(owner);
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('right-click opens the confirm and cancel closes it without removing', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const { onRemoveMember } = renderRoster();
    const target = screen.getByText('하마정리'); // u3 member m3

    fireEvent.contextMenu(target);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onRemoveMember).not.toHaveBeenCalled();
  });

  it('gives a member (non-owner) no removal affordance', () => {
    renderRoster({ isOwner: false });
    const target = screen.getByText('테스터');
    fireEvent.contextMenu(target);
    // No confirm opens for a non-owner viewer.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// Mirror of MemberRoster's LONG_PRESS_MS so the test advances past the threshold
// without importing an internal constant.
const LONG_PRESS_TICK = 600;
