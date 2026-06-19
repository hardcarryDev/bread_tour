import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const listMyTours = vi.fn();
const createTour = vi.fn();
const signOut = vi.fn();

vi.mock('../features/tour/api', () => ({
  listMyTours: (...a: unknown[]) => listMyTours(...a),
  createTour: (...a: unknown[]) => createTour(...a),
}));

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@b.com' },
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: (...a: unknown[]) => signOut(...a),
  }),
}));

import TourList from './TourList';

function renderList() {
  return render(
    <MemoryRouter>
      <TourList />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TourList (useMyTours hook + listing)', () => {
  it('shows the empty state when the user has no tours', async () => {
    listMyTours.mockResolvedValue([]);
    renderList();
    expect(
      await screen.findByText(/아직 참여 중인 투어가 없습니다/),
    ).toBeInTheDocument();
    expect(listMyTours).toHaveBeenCalledWith('u1');
  });

  it('lists the tours the user belongs to', async () => {
    listMyTours.mockResolvedValue([
      { id: 't1', name: 'Seoul Bakeries' },
      { id: 't2', name: 'Busan Bread Run' },
    ]);
    renderList();
    expect(await screen.findByText('Seoul Bakeries')).toBeInTheDocument();
    expect(screen.getByText('Busan Bread Run')).toBeInTheDocument();
  });

  it('surfaces a Korean load error', async () => {
    listMyTours.mockRejectedValue(new Error('network down'));
    renderList();
    expect(
      await screen.findByText('네트워크에 연결할 수 없습니다. 연결 상태를 확인해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/network down/)).not.toBeInTheDocument();
  });

  it('opens the create-tour modal and reloads after creation', async () => {
    listMyTours.mockResolvedValue([]);
    createTour.mockResolvedValue({ id: 't9', name: 'New Tour' });
    renderList();
    await screen.findByText(/아직 참여 중인 투어가 없습니다/);

    await userEvent.click(
      screen.getByRole('button', { name: /새 투어 만들기/ }),
    );
    expect(
      screen.getByRole('dialog', { name: /새 투어 만들기/ }),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/투어 이름/), 'New Tour');
    await userEvent.click(screen.getByRole('button', { name: '만들기' }));

    await waitFor(() =>
      expect(createTour).toHaveBeenCalledWith({
        name: 'New Tour',
        userId: 'u1',
      }),
    );
    // After creation the modal closes and the list reloads (called twice).
    await waitFor(() => expect(listMyTours).toHaveBeenCalledTimes(2));
  });

  it('signs out when the logout button is clicked', async () => {
    listMyTours.mockResolvedValue([]);
    renderList();
    await screen.findByText(/아직 참여 중인 투어가 없습니다/);
    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(signOut).toHaveBeenCalled();
  });
});
