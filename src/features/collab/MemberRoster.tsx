// Unified member roster (SPEC-BREADTOUR-001 / F5 + F6).
//
// One list of ALL tour members (not just those currently connected). Members who
// are present on the realtime channel get an "접속 중" dot; everyone else is shown
// the same so the owner can also manage offline members. This replaces the old
// split of a presence-only "접속 중" chip list + a separate bottom member list.
//
// Names are resolved from the members' profiles (displayNameFor), NOT from the
// presence payload, so a refresh that loads presence before profiles no longer
// gets stuck on "(이름 없음)": once profiles arrive the list re-renders with the
// real names.
//
// Owner-only management (AC-F6-04/06): the owner LONG-PRESSES a member's name
// (touch hold or mouse hold; right-click on desktop) to open a confirm, then
// removes them. Owner rows are never removable; members see no management UI at
// all (RLS is the real guard — this only hides controls the user cannot use).

import { useRef, useState } from 'react';
import type { TourMember } from '../../types/database';
import { displayNameFor, type DisplayNameMap } from '../profile/api';
import SectionTitle from '../../components/SectionTitle';

// Hold duration before a press counts as a long-press (ms). 500ms matches the
// common mobile long-press threshold without feeling sluggish.
const LONG_PRESS_MS = 500;

interface MemberRosterProps {
  members: TourMember[];
  // user_id -> display_name (Feature 1). Authoritative source for names.
  profileNames: DisplayNameMap;
  // user_ids currently present on the realtime channel (REQ-F5-003).
  onlineIds: Set<string>;
  isOwner: boolean;
  // Shareable invite link to surface once created (owner flow, AC-F6-02).
  inviteLink: string | null;
  onInvite: () => void;
  onRemoveMember: (memberId: string) => void;
}

export default function MemberRoster({
  members,
  profileNames,
  onlineIds,
  isOwner,
  inviteLink,
  onInvite,
  onRemoveMember,
}: MemberRosterProps) {
  // The member the owner is being asked to confirm removal for (long-press /
  // right-click target). null when no confirm is open.
  const [confirming, setConfirming] = useState<TourMember | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onlineCount = members.filter((m) => onlineIds.has(m.user_id)).length;

  // Owner may remove non-owner members only (AC-F6-04/06).
  const canRemove = (m: TourMember) => isOwner && m.role !== 'owner';

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Start the hold timer; if the press is held for LONG_PRESS_MS the confirm
  // opens. A release/leave/cancel before then aborts (clearTimer).
  const startLongPress = (m: TourMember) => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setConfirming(m);
    }, LONG_PRESS_MS);
  };

  return (
    <section className="members" aria-label="멤버">
      <div className="section-head">
        <SectionTitle icon="members">
          멤버 <span className="muted">{members.length}</span>
        </SectionTitle>
        <div className="members-head-actions">
          <span className="online-badge">
            접속 중{' '}
            <span className="connected-count" data-testid="online-count">
              {onlineCount}
            </span>
          </span>
          {isOwner && (
            <button type="button" onClick={onInvite}>
              멤버 초대
            </button>
          )}
        </div>
      </div>

      {inviteLink && (
        <p className="invite-link" data-testid="invite-link">
          초대 링크: <code>{inviteLink}</code>
        </p>
      )}

      {isOwner && (
        <p className="muted members-hint">
          이름을 길게 누르면 멤버를 내보낼 수 있어요.
        </p>
      )}

      <ul className="member-list" data-testid="member-list">
        {members.map((m) => {
          const online = onlineIds.has(m.user_id);
          const removable = canRemove(m);
          return (
            <li key={m.id} className={online ? 'is-online' : undefined}>
              <span
                className={
                  removable ? 'member-name removable' : 'member-name'
                }
                title={removable ? '길게 눌러 내보내기' : undefined}
                onPointerDown={
                  removable ? () => startLongPress(m) : undefined
                }
                onPointerUp={removable ? clearTimer : undefined}
                onPointerLeave={removable ? clearTimer : undefined}
                onPointerCancel={removable ? clearTimer : undefined}
                onContextMenu={
                  removable
                    ? (e) => {
                        // Desktop shortcut: right-click opens the same confirm.
                        // Always suppress the native menu on a long-press too.
                        e.preventDefault();
                        clearTimer();
                        setConfirming(m);
                      }
                    : undefined
                }
              >
                {online && (
                  <span className="online-dot" aria-label="접속 중" />
                )}
                {displayNameFor(m.user_id, profileNames)}
              </span>
              <span className="muted"> ({m.role})</span>
            </li>
          );
        })}
      </ul>

      {confirming && (
        <div
          className="member-remove-confirm"
          role="dialog"
          aria-modal="true"
          aria-label="멤버 내보내기 확인"
        >
          <p>
            {displayNameFor(confirming.user_id, profileNames)} 님을
            내보낼까요?
          </p>
          <div className="confirm-actions">
            <button
              type="button"
              className="danger"
              onClick={() => {
                onRemoveMember(confirming.id);
                setConfirming(null);
              }}
            >
              내보내기
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => setConfirming(null)}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
