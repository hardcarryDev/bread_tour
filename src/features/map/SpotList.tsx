import type { Spot } from '../../types/database';
import {
  formatDistance,
  formatDuration,
  type TravelMode,
} from '../directions/route';

// Per-spot route result used by the local "내기준정렬" distance sort. null means
// the route computation failed for that spot (it sorts last with no caption).
export interface SpotDistance {
  distanceM: number;
  durationSec: number;
  fallback: boolean;
}

interface SpotListProps {
  spots: Spot[];
  isOwner: boolean;
  // Called with the full reordered id list; the caller persists via reorder RPC.
  onReorder: (orderedIds: string[]) => void;
  // Owner-only delete (REQ-F6-007). Absent / non-owner => no delete controls.
  onDelete?: (spotId: string) => void;
  onEdit?: (spot: Spot) => void;
  // "내기준정렬" local view sort. When set, the list is displayed in ascending
  // distance order (closest first) and each row shows a green caption with this
  // mode's label + distance + time. This is a PERSONAL view sort only — it never
  // changes order_index / the shared plan order. null/undefined => plan order.
  sortMode?: TravelMode | null;
  // Per-spot distance/time keyed by spot id. A null entry means the route failed
  // for that spot (sorts last, no caption). Only consulted when sortMode is set.
  distanceBySpot?: Record<string, SpotDistance | null>;
}

// Mode word for the green caption, matching the DirectionsPanel basis labels.
const MODE_LABEL: Record<TravelMode, string> = {
  walk: '도보',
  transit: '대중교통',
  car: '자동차',
};

// Spot list with visit-order numbers + mobile-friendly up/down reorder controls
// (NFR-RESP: simpler and more reliable on touch than drag). Reorder emits the
// new id order; persistence is the parent's job via reorder_spots (AC-F5-06).
// Owner-only delete is gated here AND by RLS (REQ-F6-007 / AC-F6-06).
//
// "내기준정렬" (Feature): when sortMode is set the rows are *displayed* in
// ascending distance order with a green per-row caption, but the up/down arrows
// still operate on the real plan order (order_index) — the sort is a personal
// view only and is never persisted.
export default function SpotList({
  spots,
  isOwner,
  onReorder,
  onDelete,
  onEdit,
  sortMode,
  distanceBySpot,
}: SpotListProps) {
  // The shared plan order — the up/down arrows always reorder against THIS.
  const planOrdered = [...spots].sort((a, b) => a.order_index - b.order_index);

  // The displayed order. With a local distance sort active, order by ascending
  // distance (closest first); spots with no result (null) sort last. Otherwise
  // fall back to the plan order. A stable plan-order tiebreak keeps equal/failed
  // spots in a predictable sequence.
  const sorted = !sortMode
    ? planOrdered
    : [...planOrdered].sort((a, b) => {
        const da = distanceBySpot?.[a.id];
        const db = distanceBySpot?.[b.id];
        if (da && db) return da.distanceM - db.distanceM;
        if (da) return -1; // a has a result, b doesn't -> a first
        if (db) return 1; // b has a result, a doesn't -> b first
        return a.order_index - b.order_index; // both failed -> plan order
      });

  // Move operates on the PLAN order so the arrows reorder the shared plan even
  // while a personal distance sort is displayed.
  function move(from: number, to: number) {
    if (to < 0 || to >= planOrdered.length) return;
    const ids = planOrdered.map((s) => s.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    onReorder(ids);
  }

  if (sorted.length === 0) {
    return <p className="muted">아직 등록된 장소가 없습니다.</p>;
  }

  return (
    <ul className="spot-list">
      {sorted.map((spot, index) => {
        // The arrows act on the plan order, so derive each spot's plan index for
        // the move()/disabled logic (independent of the displayed order).
        const planIndex = planOrdered.findIndex((s) => s.id === spot.id);
        const dist = sortMode ? distanceBySpot?.[spot.id] : undefined;
        return (
          <li key={spot.id} className="spot-list-item">
            <span className="spot-order" aria-hidden="true">
              {index + 1}
            </span>
            <span className="spot-name">{spot.name}</span>
            <span className="muted spot-kind">{spot.kind}</span>

            {/* Green one-line distance caption (Feature). Shown only when a local
                sort is active and this spot has a result. Failed spots show a
                subtle note instead. */}
            {sortMode && dist && (
              <span className="spot-distance" data-testid="spot-distance">
                {MODE_LABEL[sortMode]} 기준 거리: {formatDistance(dist.distanceM)}{' '}
                예상 시간: {formatDuration(dist.durationSec)}
              </span>
            )}
            {sortMode && distanceBySpot && distanceBySpot[spot.id] === null && (
              <span className="spot-distance-failed muted">거리 계산 실패</span>
            )}

            <span className="spot-actions">
              <button
                type="button"
                className="link-button"
                aria-label={`위로 이동: ${spot.name}`}
                disabled={planIndex === 0}
                onClick={() => move(planIndex, planIndex - 1)}
              >
                ▲
              </button>
              <button
                type="button"
                className="link-button"
                aria-label={`아래로 이동: ${spot.name}`}
                disabled={planIndex === planOrdered.length - 1}
                onClick={() => move(planIndex, planIndex + 1)}
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
        );
      })}
    </ul>
  );
}
