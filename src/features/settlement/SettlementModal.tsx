// Per-spot settlement (정산) editor modal (SPEC-BREADTOUR-001 / F-정산).
//
// One settlement per spot: enter the total 금액, pick 참여자 (who shares the cost,
// split equally) and 결제자 (who paid — the total is split equally among payers).
// A live preview shows each person's net (받을 +, 낼 −) before saving so the split
// is visible. Reuses the app's .modal-backdrop/.modal shell (TourCreate pattern);
// closes on backdrop click + Escape (ImageViewer pattern). Korean-only UI.

import { useEffect, useState } from 'react';
import type { Spot, SpotSettlement, TourMember } from '../../types/database';
import { displayNameFor, type DisplayNameMap } from '../profile/api';
import { spotNetByUser } from './compute';
import { formatSignedWon } from './format';

interface SettlementModalProps {
  spot: Spot;
  members: TourMember[];
  profileNames: DisplayNameMap;
  currentUserId: string | undefined;
  // The spot's existing settlement when editing; undefined when creating new.
  existing: SpotSettlement | undefined;
  onSave: (v: {
    amount: number;
    payerIds: string[];
    participantIds: string[];
  }) => void;
  onDelete: () => void;
  onClose: () => void;
}

// Toggle a user id in a selection set (immutable update for React state).
function toggle(set: string[], userId: string): string[] {
  return set.includes(userId)
    ? set.filter((id) => id !== userId)
    : [...set, userId];
}

export default function SettlementModal({
  spot,
  members,
  profileNames,
  currentUserId,
  existing,
  onSave,
  onDelete,
  onClose,
}: SettlementModalProps) {
  // Amount as a string so the input can be empty mid-edit; parsed on save.
  const [amountText, setAmountText] = useState(
    existing ? String(existing.amount) : '',
  );
  // Default 참여자: everyone (or the existing participant list when editing).
  const [participantIds, setParticipantIds] = useState<string[]>(
    existing
      ? existing.participant_ids
      : members.map((m) => m.user_id),
  );
  // Default 결제자: the existing payer list, else just the current user.
  const [payerIds, setPayerIds] = useState<string[]>(
    existing
      ? existing.payer_ids
      : currentUserId
        ? [currentUserId]
        : [],
  );

  // Escape closes the modal (mirrors ImageViewer's keyboard handling).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Parse the typed amount to a non-negative whole-won number (NaN/empty -> 0).
  const amount = Math.max(0, Math.floor(Number(amountText) || 0));
  const canSave =
    amount > 0 && participantIds.length > 0 && payerIds.length > 0;

  // Live net preview so the split is visible before saving.
  const preview = spotNetByUser({ amount, payerIds, participantIds });

  function handleSave() {
    if (!canSave) return;
    onSave({ amount, payerIds, participantIds });
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`정산 · ${spot.name}`}
      data-testid="settlement-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal settlement-modal">
        <h2>정산 · {spot.name}</h2>

        <label htmlFor="settlement-amount">금액</label>
        <input
          id="settlement-amount"
          data-testid="settlement-amount"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder="총 금액 (원)"
        />

        <fieldset className="settlement-group">
          <legend>참여자 (나눠 낼 사람)</legend>
          <div className="settlement-check-grid">
            {members.map((m) => (
              <label key={m.user_id} className="settlement-check">
                <input
                  type="checkbox"
                  checked={participantIds.includes(m.user_id)}
                  onChange={() =>
                    setParticipantIds((s) => toggle(s, m.user_id))
                  }
                />
                <span>{displayNameFor(m.user_id, profileNames)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="settlement-group">
          <legend>결제자 (돈 낸 사람)</legend>
          <div className="settlement-check-grid">
            {members.map((m) => (
              <label key={m.user_id} className="settlement-check">
                <input
                  type="checkbox"
                  checked={payerIds.includes(m.user_id)}
                  onChange={() => setPayerIds((s) => toggle(s, m.user_id))}
                />
                <span>{displayNameFor(m.user_id, profileNames)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Live per-person net preview (받을 +, 낼 −). */}
        {amount > 0 && Object.keys(preview).length > 0 && (
          <div className="settlement-preview" data-testid="settlement-preview">
            <p className="muted settlement-preview-title">미리보기</p>
            <ul>
              {Object.entries(preview).map(([userId, net]) => (
                <li key={userId}>
                  <span>{displayNameFor(userId, profileNames)}</span>
                  <span
                    className={
                      net > 0
                        ? 'settlement-net-pos'
                        : net < 0
                          ? 'settlement-net-neg'
                          : 'muted'
                    }
                  >
                    {formatSignedWon(net)}원
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="modal-actions">
          {existing && (
            <button
              type="button"
              className="link-button danger"
              data-testid="settlement-delete"
              onClick={onDelete}
            >
              삭제
            </button>
          )}
          <button type="button" className="link-button" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            data-testid="settlement-save"
            disabled={!canSave}
            onClick={handleSave}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
