import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const signIn = vi.fn();
const signUp = vi.fn();
const mockUser: { current: unknown } = { current: null };

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({
    user: mockUser.current,
    loading: false,
    signIn: (...a: unknown[]) => signIn(...a),
    signUp: (...a: unknown[]) => signUp(...a),
    signOut: vi.fn(),
  }),
}));

const pushToast = vi.fn();
vi.mock('../features/collab/toast-context', () => ({
  useGlobalToast: () => ({ push: (...a: unknown[]) => pushToast(...a) }),
}));

import Login from './Login';

// Render Login inside a tiny router so a redirect to /tours can be observed.
function renderLogin(initialPath = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/tours" element={<div>Tour List Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.current = null;
});

describe('Login page (REQ-F5-001)', () => {
  it('submits email + password to signIn', async () => {
    signIn.mockResolvedValue({ error: null });
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    await userEvent.type(
      screen.getByLabelText('이메일'),
      'a@b.com',
    );
    await userEvent.type(screen.getByLabelText('비밀번호'), 'secret123');
    await userEvent.click(
      screen.getByRole('button', { name: '로그인' }),
    );

    expect(signIn).toHaveBeenCalledWith('a@b.com', 'secret123');
  });

  it('shows a Korean error message when sign-in fails', async () => {
    // Supabase returns an English message + code; the UI must map it to Korean
    // and never leak the raw English (REQ-F5-001).
    signIn.mockResolvedValue({
      error: { message: 'Invalid login credentials', code: 'invalid_credentials' },
    });
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'wrong');
    await userEvent.click(
      screen.getByRole('button', { name: '로그인' }),
    );
    expect(
      await screen.findByText('이메일 또는 비밀번호가 올바르지 않습니다.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/invalid login credentials/i),
    ).not.toBeInTheDocument();
  });
});

describe('Login signup display name + feedback (Feature 1 + 2)', () => {
  function switchToSignup() {
    return userEvent.click(
      screen.getByRole('button', { name: '계정이 없으신가요? 회원가입' }),
    );
  }

  it('shows the display-name field only in signup mode', async () => {
    renderLogin();
    // Sign-in mode: no name field.
    expect(screen.queryByLabelText(/이름/)).not.toBeInTheDocument();
    await switchToSignup();
    expect(screen.getByLabelText(/이름/)).toBeInTheDocument();
  });

  it('passes the display name to signUp on signup (Feature 1)', async () => {
    signUp.mockResolvedValue({
      error: null,
      session: { user: { id: 'u3' } },
    });
    renderLogin();
    await switchToSignup();
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'secret123');
    await userEvent.type(screen.getByLabelText(/이름/), '빵돌이');
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));
    expect(signUp).toHaveBeenCalledWith('a@b.com', 'secret123', '빵돌이');
  });

  it('redirects an already-authenticated user away from /login (Feature 2)', () => {
    mockUser.current = { id: 'u1', email: 'a@b.com' };
    renderLogin();
    expect(screen.getByText('Tour List Page')).toBeInTheDocument();
    // The login form must not be shown to an authenticated user.
    expect(
      screen.queryByRole('button', { name: '로그인' }),
    ).not.toBeInTheDocument();
  });

  it('on successful signup with a session, shows a success toast (Feature 2)', async () => {
    signUp.mockResolvedValue({
      error: null,
      session: { user: { id: 'u3' } },
    });
    renderLogin();
    await switchToSignup();
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'secret123');
    await userEvent.type(screen.getByLabelText(/이름/), '빵돌이');
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));
    expect(pushToast).toHaveBeenCalledWith(
      expect.stringContaining('회원가입 완료'),
    );
  });

  it('on signup with no session, shows the check-email message (Feature 2)', async () => {
    // Email confirmation ON -> Supabase returns no session.
    signUp.mockResolvedValue({ error: null, session: null });
    renderLogin();
    await switchToSignup();
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'secret123');
    await userEvent.type(screen.getByLabelText(/이름/), '빵돌이');
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));
    expect(
      await screen.findByText(/확인 메일을 보냈습니다/),
    ).toBeInTheDocument();
    // No success toast for the unconfirmed case.
    expect(pushToast).not.toHaveBeenCalled();
  });

  it('shows a Korean error and no toast when signup fails', async () => {
    signUp.mockResolvedValue({
      error: { message: 'User already registered', code: 'user_already_exists' },
      session: null,
    });
    renderLogin();
    await switchToSignup();
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'secret123');
    await userEvent.type(screen.getByLabelText(/이름/), '빵돌이');
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));
    expect(
      await screen.findByText('이미 가입된 이메일입니다. 로그인해 주세요.'),
    ).toBeInTheDocument();
    expect(pushToast).not.toHaveBeenCalled();
  });
});
