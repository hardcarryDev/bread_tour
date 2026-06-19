import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const createTour = vi.fn();

vi.mock('../features/tour/api', () => ({
  createTour: (...a: unknown[]) => createTour(...a),
}));

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@b.com' },
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}));

import TourCreate from './TourCreate';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TourCreate (REQ-F6-001 / AC-F6-01)', () => {
  it('navigates to the new tour when used standalone (no onCreated)', async () => {
    createTour.mockResolvedValue({ id: 't9', name: 'Solo Tour' });
    render(
      <MemoryRouter initialEntries={['/create']}>
        <Routes>
          <Route path="/create" element={<TourCreate />} />
          <Route path="/tours/:tourId" element={<div>Detail t9</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/투어 이름/), 'Solo Tour');
    await userEvent.click(screen.getByRole('button', { name: '만들기' }));

    await waitFor(() =>
      expect(createTour).toHaveBeenCalledWith({
        name: 'Solo Tour',
        userId: 'u1',
      }),
    );
    expect(await screen.findByText('Detail t9')).toBeInTheDocument();
  });

  it('shows a Korean error when creation fails', async () => {
    // Raw backend message is English; the UI must show a Korean message instead
    // (REQ-F5-001). An unrecognised message collapses to the generic fallback.
    createTour.mockRejectedValue(new Error('insert denied'));
    render(
      <MemoryRouter>
        <TourCreate />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText(/투어 이름/), 'X');
    await userEvent.click(screen.getByRole('button', { name: '만들기' }));
    expect(
      await screen.findByText('문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/insert denied/)).not.toBeInTheDocument();
  });

  it('calls onClose when cancel is clicked', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <TourCreate onClose={onClose} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onClose).toHaveBeenCalled();
  });
});
