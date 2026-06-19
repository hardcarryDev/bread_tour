import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import { createTour } from '../features/tour/api';
import { errorMessage } from '../lib/errors';

interface TourCreateProps {
  // When used as a modal from TourList.
  onClose?: () => void;
  onCreated?: (tourId: string) => void;
}

// Create-tour modal. The creator becomes owner server-side (REQ-F6-001 /
// AC-F6-01) via the tours_add_owner_membership trigger.
export default function TourCreate({ onClose, onCreated }: TourCreateProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const tour = await createTour({ name, userId: user.id });
      if (onCreated) {
        onCreated(tour.id);
      } else {
        navigate(`/tours/${tour.id}`);
      }
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="새 투어 만들기">
      <div className="modal">
        <h2>새 투어 만들기</h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="tour-name">투어 이름</label>
          <input
            id="tour-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            {onClose && (
              <button type="button" className="link-button" onClick={onClose}>
                취소
              </button>
            )}
            <button type="submit" disabled={submitting || name.trim() === ''}>
              만들기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
