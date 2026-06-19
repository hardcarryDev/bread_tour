import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import { getMyProfile, updateMyDisplayName } from '../features/profile/api';
import { useGlobalToast } from '../features/collab/toast-context';
import { errorMessage } from '../lib/errors';

// "정보 변경" page (chosen over a modal for simplicity and a clean deep-link at
// /profile). Only the display name (이름) is editable — the email is shown
// read-only and no password/email editing is exposed. On save the profile row
// is updated (the member list + presence read profiles, so the new name shows
// once the user navigates back), a success toast is pushed via the app-level
// ToastProvider, and we return to the tour list.
export default function ProfileEdit() {
  const { user } = useAuth();
  const toast = useGlobalToast();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Prefill from the user's own profile (RLS-permitted own-row read).
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    getMyProfile(user.id)
      .then((profile) => {
        if (!active) return;
        setDisplayName(profile?.display_name ?? '');
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        setError(errorMessage(e));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user?.id) return;
    setError(null);

    // Validate emptiness in the UI so we never fire a doomed request and can
    // show the Korean message immediately (the data layer guards it too).
    if (!displayName.trim()) {
      setError('이름을 입력해 주세요.');
      return;
    }

    setSaving(true);
    try {
      await updateMyDisplayName(user.id, displayName);
      toast.push('이름이 변경되었습니다');
      // Member list / presence read profiles, so returning to /tours (and then
      // into a tour) reflects the new name without any stale cache.
      navigate('/tours');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page page-profile-edit">
      <header className="page-header">
        <h1>정보 변경</h1>
        <button
          type="button"
          className="link-button"
          onClick={() => navigate('/tours')}
        >
          뒤로
        </button>
      </header>

      {loading ? (
        <p className="muted">불러오는 중...</p>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">이메일</label>
          {/* Email is read-only: shown for reference, never editable. */}
          <p id="email" className="readonly-field">
            {user?.email}
          </p>

          <label htmlFor="display-name">이름 (표시 이름)</label>
          <input
            id="display-name"
            type="text"
            autoComplete="nickname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="멤버 목록에 표시될 이름"
          />

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <div className="form-actions">
            <button type="submit" disabled={saving}>
              저장
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => navigate('/tours')}
            >
              취소
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
