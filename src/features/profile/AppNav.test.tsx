import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const signOut = vi.fn();
const useProfiles = vi.fn();

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'baker@bread.test' },
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: (...a: unknown[]) => signOut(...a),
  }),
}));

vi.mock('./useProfiles', () => ({
  useProfiles: (...a: unknown[]) => useProfiles(...a),
}));

import AppNav from './AppNav';

function renderNav() {
  return render(
    <MemoryRouter initialEntries={['/tours']}>
      <Routes>
        <Route path="/tours" element={<AppNav />} />
        <Route path="/profile" element={<div>정보 변경 페이지</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useProfiles.mockReturnValue({ u1: '빵돌이' });
});

describe('AppNav (entry point to 정보 변경)', () => {
  it('shows the current user display name', () => {
    renderNav();
    expect(screen.getByText('빵돌이')).toBeInTheDocument();
  });

  it('routes to /profile when the 정보 변경 link is clicked', async () => {
    renderNav();
    await userEvent.click(screen.getByRole('link', { name: '정보 변경' }));
    expect(await screen.findByText('정보 변경 페이지')).toBeInTheDocument();
  });

  it('signs out when 로그아웃 is clicked', async () => {
    renderNav();
    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(signOut).toHaveBeenCalled();
  });

  it('falls back to a placeholder when the name is not loaded yet', () => {
    useProfiles.mockReturnValue({});
    renderNav();
    expect(screen.getByText('(이름 없음)')).toBeInTheDocument();
  });
});
