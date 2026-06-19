import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import { acceptInvite, rejectInvite } from '../features/tour/api';
import { errorMessage } from '../lib/errors';

// Handles an invite link (/invite/:token). The route is protected, so the user
// is already authenticated here. Accept -> join the tour and navigate to it;
// reject -> mark rejected and return to the tour list (REQ-F6-003 / AC-F6-03).
export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAccept() {
    if (!token || !user) return;
    setBusy(true);
    setError(null);
    try {
      const { tourId } = await acceptInvite({ token, userId: user.id });
      navigate(`/tours/${tourId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await rejectInvite(token);
      navigate('/tours');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="page page-invite">
      <h1>투어 초대</h1>
      <p className="muted">이 투어에 참여하시겠어요?</p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="invite-actions">
        <button type="button" onClick={handleAccept} disabled={busy}>
          수락
        </button>
        <button
          type="button"
          className="link-button"
          onClick={handleReject}
          disabled={busy}
        >
          거절
        </button>
      </div>
    </main>
  );
}
