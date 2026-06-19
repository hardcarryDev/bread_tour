// Tour progress view: each spot's stamp status + arrival time in visit order
// (SPEC-BREADTOUR-001 / REQ-F1-005 / AC-F1-07), with a permission-gated
// cancel control (REQ-F1-009/010 / AC-F1-08/09).
//
// Permission gating here is UI-only: a member sees a cancel button only for
// their OWN stamps, and the tour owner sees it for any stamp. RLS is the real
// enforcement (NFR-SEC-004); this component just avoids offering an action that
// would be denied. After a cancel, the same member may re-stamp (REQ-F1-011) —
// that is handled by the GPS pipeline, not this view.

import type { Spot } from '../../types/database';
import type { StampStatus } from './api';

interface StampProgressProps {
  spots: Spot[];
  stampBySpot: Record<string, StampStatus>;
  currentUserId: string | undefined;
  isOwner: boolean;
  onCancel: (stampId: string) => void;
}

function formatArrival(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ko-KR');
}

export default function StampProgress({
  spots,
  stampBySpot,
  currentUserId,
  isOwner,
  onCancel,
}: StampProgressProps) {
  const ordered = [...spots].sort((a, b) => a.order_index - b.order_index);

  if (ordered.length === 0) {
    return <p className="muted">아직 등록된 장소가 없습니다.</p>;
  }

  return (
    <ul className="stamp-progress" aria-label="스탬프 진행 상황">
      {ordered.map((spot, index) => {
        const status = stampBySpot[spot.id];
        const stamped = Boolean(status?.stamped);
        // A member may cancel their own stamp; the owner may cancel any stamp.
        const canCancel =
          stamped &&
          status?.stampId !== undefined &&
          (isOwner || status?.userId === currentUserId);

        return (
          <li key={spot.id} className="stamp-progress-item">
            <span className="spot-order" aria-hidden="true">
              {index + 1}
            </span>
            <span className="spot-name">{spot.name}</span>
            <span
              className={stamped ? 'stamp-acquired' : 'muted'}
              data-testid={`stamp-status-${spot.id}`}
            >
              {stamped ? '획득' : '미획득'}
            </span>
            {stamped && status?.arrivedAt && (
              <span className="stamp-time muted">
                {formatArrival(status.arrivedAt)}
              </span>
            )}
            {canCancel && (
              <button
                type="button"
                className="link-button danger"
                aria-label={`스탬프 취소: ${spot.name}`}
                onClick={() => onCancel(status!.stampId!)}
              >
                스탬프 취소
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
