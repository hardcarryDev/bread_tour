import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const acceptInvite = vi.fn();
const rejectInvite = vi.fn();

vi.mock('../features/tour/api', () => ({
  acceptInvite: (...a: unknown[]) => acceptInvite(...a),
  rejectInvite: (...a: unknown[]) => rejectInvite(...a),
}));

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u2', email: 'invitee@b.com' },
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}));

import InviteAccept from './InviteAccept';

function renderInvite() {
  return render(
    <MemoryRouter initialEntries={['/invite/abc123']}>
      <Routes>
        <Route path="/invite/:token" element={<InviteAccept />} />
        <Route path="/tours/:tourId" element={<div>Tour Detail Page</div>} />
        <Route path="/tours" element={<div>Tour List Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InviteAccept (REQ-F6-003 / AC-F6-03)', () => {
  it('accepts the invite and navigates to the tour on accept', async () => {
    acceptInvite.mockResolvedValue({ tourId: 't1' });
    renderInvite();

    await userEvent.click(
      await screen.findByRole('button', { name: '수락' }),
    );

    await waitFor(() =>
      expect(acceptInvite).toHaveBeenCalledWith({
        token: 'abc123',
        userId: 'u2',
      }),
    );
    expect(await screen.findByText('Tour Detail Page')).toBeInTheDocument();
  });

  it('rejects the invite and does not join the tour', async () => {
    rejectInvite.mockResolvedValue(undefined);
    renderInvite();

    await userEvent.click(
      await screen.findByRole('button', { name: '거절' }),
    );

    await waitFor(() =>
      expect(rejectInvite).toHaveBeenCalledWith('abc123'),
    );
    expect(acceptInvite).not.toHaveBeenCalled();
    expect(await screen.findByText('Tour List Page')).toBeInTheDocument();
  });

  it('shows a Korean error message when accept fails (invalid token)', async () => {
    acceptInvite.mockRejectedValue(new Error('Invalid invite token'));
    renderInvite();
    await userEvent.click(
      await screen.findByRole('button', { name: '수락' }),
    );
    expect(
      await screen.findByText(
        '유효하지 않은 초대 링크입니다. 초대한 사람에게 링크를 다시 받아 주세요.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/invalid invite token/i),
    ).not.toBeInTheDocument();
  });
});
