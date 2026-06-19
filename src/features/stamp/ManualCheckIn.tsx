// Manual check-in fallback surface (SPEC-BREADTOUR-001 / REQ-F1-007 / AC-F1-04).
//
// Shown when GPS auto-stamp is unavailable (permission denied / accuracy
// insufficient — `available` is driven by the geo pipeline). It lets a member:
//   - request a manual check-in for an un-stamped spot (creates a PENDING
//     request, NOT a stamp);
//   - confirm ANOTHER member's pending request (the confirm button is hidden for
//     the requester themselves — REQ-F1-007 requires a DIFFERENT member);
//   - withdraw their own pending request.
//
// This is purely presentational: all data access (request / confirm via RPC /
// cancel) and the real requester != confirmer enforcement live in the API + RLS
// + confirm_manual_checkin() RPC. Hiding the self-confirm button here is a UX
// affordance only, not the security boundary (NFR-SEC-004).

import type { ManualCheckInRequest, Spot } from '../../types/database';

interface ManualCheckInProps {
  // True when auto-stamp cannot run (GPS denied / accuracy too low). The manual
  // fallback is only offered in that case (NFR-GEO-002 / EC-01/02).
  available: boolean;
  spots: Spot[];
  // Spot ids that already have a valid stamp — no manual request offered there.
  stampedSpotIds: Set<string>;
  // Live pending requests for this tour (other members' + the user's own).
  pendingRequests: ManualCheckInRequest[];
  currentUserId: string | undefined;
  onRequest: (spotId: string) => void;
  onConfirm: (requestId: string, requesterId: string) => void;
  onCancelRequest: (requestId: string) => void;
}

export default function ManualCheckIn({
  available,
  spots,
  stampedSpotIds,
  pendingRequests,
  currentUserId,
  onRequest,
  onConfirm,
  onCancelRequest,
}: ManualCheckInProps) {
  if (!available) return null;

  const ordered = [...spots].sort((a, b) => a.order_index - b.order_index);
  const spotName = (id: string) =>
    spots.find((s) => s.id === id)?.name ?? id;

  // Spots that have no valid stamp AND no outstanding pending request can be
  // requested. (A spot with a pending request is shown in the requests list.)
  const pendingSpotIds = new Set(pendingRequests.map((r) => r.spot_id));
  const requestable = ordered.filter(
    (s) => !stampedSpotIds.has(s.id) && !pendingSpotIds.has(s.id),
  );

  return (
    <div className="manual-checkin" aria-label="수동 체크인">
      <p className="muted">
        자동 스탬프를 사용할 수 없습니다. 다른 멤버의 확인을 거쳐 수동으로 도착을
        기록할 수 있습니다.
      </p>

      {requestable.length > 0 && (
        <ul className="manual-checkin-request-list">
          {requestable.map((s) => (
            <li key={s.id}>
              <span className="spot-name">{s.name}</span>
              <button
                type="button"
                aria-label={`수동 체크인 요청: ${s.name}`}
                onClick={() => onRequest(s.id)}
              >
                수동 체크인 요청
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingRequests.length > 0 && (
        <ul className="manual-checkin-pending-list" aria-label="대기 중인 수동 체크인">
          {pendingRequests.map((r) => {
            const isMine = r.requester_id === currentUserId;
            return (
              <li key={r.id} data-testid={`pending-${r.id}`}>
                <span className="spot-name">{spotName(r.spot_id)}</span>
                <span className="muted"> — {r.requester_id} 요청</span>
                {isMine ? (
                  // The requester may withdraw, but cannot confirm their own
                  // request (REQ-F1-007).
                  <button
                    type="button"
                    className="link-button"
                    aria-label={`요청 취소: ${spotName(r.spot_id)}`}
                    onClick={() => onCancelRequest(r.id)}
                  >
                    요청 취소
                  </button>
                ) : (
                  // A DIFFERENT member confirms -> the stamp is created server
                  // side (AC-F1-04).
                  <button
                    type="button"
                    aria-label={`수동 체크인 확인: ${spotName(r.spot_id)}`}
                    onClick={() => onConfirm(r.id, r.requester_id)}
                  >
                    확인
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
