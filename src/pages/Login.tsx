import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import { authErrorMessage } from '../features/auth/authErrors';
import { useGlobalToast } from '../features/collab/toast-context';

// Email + password sign-in / sign-up (REQ-F5-001). On success the auth state
// listener flips `user`, and this page redirects to the originally requested
// route (or /tours). Signup additionally collects a display name (Feature 1)
// and gives explicit feedback instead of an abrupt jump (Feature 2).
export default function Login() {
  const { user, signIn, signUp } = useAuth();
  const toast = useGlobalToast();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState<string | null>(null);
  // Set when signup succeeds but there is no session yet (email confirmation
  // is ON). The user must confirm by email before they can sign in (Feature 2).
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from =
    (location.state as { from?: string } | null)?.from ?? '/tours';

  // Already authenticated (incl. immediately after a confirmation-OFF signup,
  // once onAuthStateChange flips `user`): never linger on the form (Feature 2).
  if (user) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    if (mode === 'signin') {
      const { error: err } = await signIn(email, password);
      setSubmitting(false);
      if (err) setError(authErrorMessage(err));
      return;
    }

    // Signup: forward the display name, then branch on whether a session exists.
    const { error: err, session } = await signUp(email, password, displayName);
    setSubmitting(false);
    if (err) {
      setError(authErrorMessage(err));
      return;
    }
    if (session) {
      // Confirmation OFF: the auth listener will flip `user` and the <Navigate>
      // above redirects into the app. Surface a success toast on the way in.
      toast.push('회원가입 완료 · 환영합니다');
    } else {
      // Confirmation ON: no session yet — tell the user to check their email.
      setNotice('확인 메일을 보냈습니다. 메일 인증 후 로그인하세요.');
    }
  }

  return (
    <main className="page page-login">
      <h1>빵투어</h1>
      <p className="muted">
        {mode === 'signin' ? '로그인하여 투어를 시작하세요' : '새 계정을 만드세요'}
      </p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label htmlFor="email">이메일</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="password">비밀번호</label>
        <input
          id="password"
          type="password"
          autoComplete={
            mode === 'signin' ? 'current-password' : 'new-password'
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {mode === 'signup' && (
          <>
            <label htmlFor="display-name">이름 (표시 이름)</label>
            <input
              id="display-name"
              type="text"
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="멤버 목록에 표시될 이름"
              required
            />
          </>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {notice && (
          <p className="form-notice" role="status">
            {notice}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {mode === 'signin' ? '로그인' : '회원가입'}
        </button>
      </form>

      <button
        type="button"
        className="link-button"
        onClick={() => {
          setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
          setError(null);
          setNotice(null);
        }}
      >
        {mode === 'signin'
          ? '계정이 없으신가요? 회원가입'
          : '이미 계정이 있으신가요? 로그인'}
      </button>
    </main>
  );
}
