// Per-spot settlement (정산) editor modal (SPEC-BREADTOUR-001 / F-정산).
//
// One settlement per spot: enter the total 금액, pick 참여자 (who shares the cost,
// split equally) and a SINGLE 결제자 (the one person who paid the whole bill at the
// store). Everyone else owes the payer their share; when someone sends their share
// back, mark them 보냄 (정산 완료) so they drop out of the outstanding total.
// A live preview shows each person's gross net (받을 +, 낼 −) and a 보냄 checkbox
// for each ower. Reuses the app's .modal-backdrop/.modal shell (TourCreate pattern);
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
    settledIds: string[];
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
    existing ? existing.participant_ids : members.map((m) => m.user_id),
  );
  // Default 결제자: the existing single payer, else the current user (if a member),
  // else none. Exactly one id is ever stored here (a single payer).
  const [payerId, setPayerId] = useState<string | null>(() => {
    if (existing) return existing.payer_ids[0] ?? null;
    if (currentUserId && members.some((m) => m.user_id === currentUserId)) {
      return currentUserId;
    }
    return null;
  });
  // Default 보냄/정산 완료: participants (non-payer) who already paid the payer back.
  const [settledIds, setSettledIds] = useState<string[]>(
    existing ? existing.settled_ids : [],
  );

  // Escape closes the modal (mirrors ImageViewer's keyboard handling).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Owers = participants who are NOT the payer (only they can be marked 보냄).
  const owerIds = participantIds.filter((id) => id !== payerId);
  // Prune settledIds to current owers whenever payer/participants change, so a
  // stale settled id (e.g. someone removed from 참여자, or now the payer) can't
  // persist into the saved row. Effectively recomputed on every render via the
  // owerIds filter below; we also keep state pruned on toggle.
  const effectiveSettledIds = settledIds.filter((id) => owerIds.includes(id));

  // Parse the typed amount to a non-negative whole-won number (NaN/empty -> 0).
  const amount = Math.max(0, Math.floor(Number(amountText) || 0));
  const canSave =
    amount > 0 && participantIds.length > 0 && payerId !== null;

  // Live GROSS net preview so the full split is visible before saving (settled
  // owers are still shown at their gross amount, just marked 완료).
  const payerIds = payerId ? [payerId] : [];
  const preview = spotNetByUser({
    amount,
    payerIds,
    participantIds,
    settledIds: effectiveSettledIds,
  });
  const settledSet = new Set(effectiveSettledIds);

  function handleSave() {
    if (!canSave || payerId === null) return;
    onSave({
      amount,
      payerIds: [payerId],
      participantIds,
      settledIds: effectiveSettledIds,
    });
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
          <legend>결제자 (돈 낸 사람 · 한 명)</legend>
          <div className="settlement-check-grid">
            {members.map((m) => (
              <label key={m.user_id} className="settlement-check">
                <input
                  type="radio"
                  name="settlement-payer"
                  checked={payerId === m.user_id}
                  onChange={() => setPayerId(m.user_id)}
                />
                <span>{displayNameFor(m.user_id, profileNames)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Live per-person preview (받을 +, 낼 −). Each ower row carries a 보냄
            checkbox to mark them 정산 완료; settled owers show 완료. */}
        {amount > 0 && Object.keys(preview).length > 0 && (
          <div className="settlement-preview" data-testid="settlement-preview">
            <p className="muted settlement-preview-title">미리보기</p>
            <ul>
              {Object.entries(preview).map(([userId, net]) => {
                const isOwer = owerIds.includes(userId);
                const isSettled = settledSet.has(userId);
                return (
                  <li key={userId} className={isSettled ? 'settlement-settled' : undefined}>
                    <span>{displayNameFor(userId, profileNames)}</span>
                    <span className="settlement-preview-right">
                      <span
                        className={
                          isSettled
                            ? 'settlement-net-done'
                            : net > 0
                              ? 'settlement-net-pos'
                              : net < 0
                                ? 'settlement-net-neg'
                                : 'muted'
                        }
                      >
                        {formatSignedWon(net)}원
                      </span>
                      {isOwer && (
                        <label className="settlement-sent">
                          <input
                            type="checkbox"
                            data-testid={`settlement-sent-${userId}`}
                            checked={isSettled}
                            onChange={() =>
                              setSettledIds((s) => toggle(s, userId))
                            }
                          />
                          {isSettled ? (
                            <span className="settlement-done-tag">✓ 완료</span>
                          ) : (
                            <span>보냄</span>
                          )}
                        </label>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="modal-actions">
          {existing && (
            <button
              type="button"
              className="btn-danger-ghost"
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
