import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const getMyProfile = vi.fn();
const updateMyDisplayName = vi.fn();
const push = vi.fn();

vi.mock('../features/profile/api', () => ({
  getMyProfile: (...a: unknown[]) => getMyProfile(...a),
  updateMyDisplayName: (...a: unknown[]) => updateMyDisplayName(...a),
}));

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'baker@bread.test' },
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../features/collab/toast-context', () => ({
  useGlobalToast: () => ({ push }),
}));

import ProfileEdit from './ProfileEdit';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<ProfileEdit />} />
        <Route path="/tours" element={<div>투어 목록</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMyProfile.mockResolvedValue({ id: 'u1', display_name: '빵돌이' });
  updateMyDisplayName.mockResolvedValue(undefined);
});

describe('ProfileEdit page (정보 변경 — display name only)', () => {
  it('prefills the name input with the current display name', async () => {
    renderPage();
    const input = (await screen.findByLabelText(/이름/)) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('빵돌이'));
    expect(getMyProfile).toHaveBeenCalledWith('u1');
  });

  it('shows the email read-only and never exposes password/email editing', async () => {
    renderPage();
    await screen.findByLabelText(/이름/);
    // Email is shown for reference but not editable.
    expect(screen.getByText('baker@bread.test')).toBeInTheDocument();
    expect(screen.queryByLabelText(/비밀번호/)).not.toBeInTheDocument();
    // No editable email field (the email is rendered as plain text, not input).
    expect(screen.queryByRole('textbox', { name: /이메일/ })).toBeNull();
  });

  it('saves the trimmed new name, shows a success toast, and navigates back', async () => {
    renderPage();
    const input = await screen.findByLabelText(/이름/);
    await userEvent.clear(input);
    await userEvent.type(input, '  빵순이  ');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(updateMyDisplayName).toHaveBeenCalledWith('u1', '  빵순이  '),
    );
    expect(push).toHaveBeenCalledWith('이름이 변경되었습니다');
    expect(await screen.findByText('투어 목록')).toBeInTheDocument();
  });

  it('rejects an empty name with a Korean validation message (no API call)', async () => {
    renderPage();
    const input = await screen.findByLabelText(/이름/);
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('이름을 입력해 주세요.')).toBeInTheDocument();
    expect(updateMyDisplayName).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a Korean-mapped error when the update fails', async () => {
    // Raw backend message is English; the UI must show a Korean message.
    updateMyDisplayName.mockRejectedValue(new Error('row-level security'));
    renderPage();
    const input = await screen.findByLabelText(/이름/);
    await userEvent.clear(input);
    await userEvent.type(input, '빵순이');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(
      await screen.findByText('이 작업을 수행할 권한이 없습니다.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/row-level security/)).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('returns to the tour list when 취소 is clicked without saving', async () => {
    renderPage();
    await screen.findByLabelText(/이름/);
    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(await screen.findByText('투어 목록')).toBeInTheDocument();
    expect(updateMyDisplayName).not.toHaveBeenCalled();
  });
});
