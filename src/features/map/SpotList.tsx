import type { Spot } from '../../types/database';

interface SpotListProps {
  spots: Spot[];
  isOwner: boolean;
  // Called with the full reordered id list; the caller persists via reorder RPC.
  onReorder: (orderedIds: string[]) => void;
  // Owner-only delete (REQ-F6-007). Absent / non-owner => no delete controls.
  onDelete?: (spotId: string) => void;
  onEdit?: (spot: Spot) => void;
}

// Spot list with visit-order numbers + mobile-friendly up/down reorder controls
// (NFR-RESP: simpler and more reliable on touch than drag). Reorder emits the
// new id order; persistence is the parent's job via reorder_spots (AC-F5-06).
// Owner-only delete is gated here AND by RLS (REQ-F6-007 / AC-F6-06).
export default function SpotList({
  spots,
  isOwner,
  onReorder,
  onDelete,
  onEdit,
}: SpotListProps) {
  const ordered = [...spots].sort((a, b) => a.order_index - b.order_index);

  function move(from: number, to: number) {
    if (to < 0 || to >= ordered.length) return;
    const ids = ordered.map((s) => s.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    onReorder(ids);
  }

  if (ordered.length === 0) {
    return <p className="muted">아직 등록된 장소가 없습니다.</p>;
  }

  return (
    <ul className="spot-list">
      {ordered.map((spot, index) => (
        <li key={spot.id} className="spot-list-item">
          <span className="spot-order" aria-hidden="true">
            {index + 1}
          </span>
          <span className="spot-name">{spot.name}</span>
          <span className="muted spot-kind">
            {spot.kind === 'bakery' ? '빵집' : '음식점'}
          </span>

          <span className="spot-actions">
            <button
              type="button"
              className="link-button"
              aria-label={`위로 이동: ${spot.name}`}
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
            >
              ▲
            </button>
            <button
              type="button"
              className="link-button"
              aria-label={`아래로 이동: ${spot.name}`}
              disabled={index === ordered.length - 1}
              onClick={() => move(index, index + 1)}
            >
              ▼
            </button>
            {onEdit && (
              <button
                type="button"
                className="link-button"
                aria-label={`장소 편집: ${spot.name}`}
                onClick={() => onEdit(spot)}
              >
                편집
              </button>
            )}
            {isOwner && onDelete && (
              <button
                type="button"
                className="link-button danger"
                aria-label={`장소 삭제: ${spot.name}`}
                onClick={() => onDelete(spot.id)}
              >
                삭제
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
