import { useState, type ReactNode } from 'react';
import type { Spot, SpotSettlement, TourMember } from '../../types/database';
import type { SpotMenuWithAuthor } from '../menu/api';
import ImageViewer, { type ViewerImage } from '../../components/ImageViewer';
import { displayNameFor, type DisplayNameMap } from '../profile/api';
import { spotNetByUser } from '../settlement/compute';
import { formatSignedWon, formatWon } from '../settlement/format';
import { segmentColor } from './spotColors';
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
  // Inline edit: the id of the spot currently being edited, and a render function
  // that returns the editor UI. When a row matches, its content is replaced by
  // the editor so editing happens IN the row (not in a separate form above).
  editingSpotId?: string;
  renderEditor?: (spot: Spot) => ReactNode;
  // "내기준정렬" local view sort. When set, the list is displayed in ascending
  // distance order (closest first) and each row shows a green caption with this
  // mode's label + distance + time. This is a PERSONAL view sort only — it never
  // changes order_index / the shared plan order. null/undefined => plan order.
  sortMode?: TravelMode | null;
  // Per-spot distance/time keyed by spot id. A null entry means the route failed
  // for that spot (sorts last, no caption). Only consulted when sortMode is set.
  distanceBySpot?: Record<string, SpotDistance | null>;
  // spot_id -> recommended menus (with contributor). Shown inline per row so the
  // signature/recommended menu is visible without opening the map marker
  // (REQ-F4-002/003). Empty / missing => "추천 메뉴 없음".
  menusBySpot?: Record<string, SpotMenuWithAuthor[]>;
  // spot_id -> the spot's settlement (정산), if any. When present, the row shows a
  // compact per-person net caption; the 정산 button opens the editor either way.
  settlementBySpot?: Record<string, SpotSettlement>;
  // Open the settlement editor for a spot (any member, not owner-gated). When
  // absent, the 정산 button is not rendered.
  onSettle?: (spotId: string) => void;
  // Members + name map for resolving the settlement caption's person labels.
  members?: TourMember[];
  profileNames?: DisplayNameMap;
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
  editingSpotId,
  renderEditor,
  sortMode,
  distanceBySpot,
  menusBySpot = {},
  settlementBySpot = {},
  onSettle,
  profileNames = {},
}: SpotListProps) {
  // In-app photo viewer state: the image set being viewed + the active index.
  // null when closed. Opening a menu's thumbnail loads that menu's full image
  // list so the user can swipe through all of its photos.
  const [viewer, setViewer] = useState<{
    images: ViewerImage[];
    index: number;
  } | null>(null);

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
    <>
    <ul className="spot-list">
      {sorted.map((spot, index) => {
        // The arrows act on the plan order, so derive each spot's plan index for
        // the move()/disabled logic (independent of the displayed order).
        const planIndex = planOrdered.findIndex((s) => s.id === spot.id);
        const dist = sortMode ? distanceBySpot?.[spot.id] : undefined;
        // Settlement caption parts (정산): per-person GROSS net for this spot, if
        // any. Settled owers (settled_ids) keep their gross amount but are marked
        // 완료 below.
        const settlement = settlementBySpot[spot.id];
        const settlementNets = settlement
          ? spotNetByUser({
              amount: settlement.amount,
              payerIds: settlement.payer_ids,
              participantIds: settlement.participant_ids,
              settledIds: settlement.settled_ids,
            })
          : null;
        const settledSet = settlement
          ? new Set(settlement.settled_ids)
          : null;

        // Inline edit: replace this row's content with the editor (the edit form
        // appears IN the clicked row, not in a separate panel above the list).
        if (renderEditor && spot.id === editingSpotId) {
          return (
            <li
              key={spot.id}
              className="spot-list-item spot-list-item-editing"
              data-testid="spot-row-editor"
            >
              <span className="spot-order" aria-hidden="true">
                {index + 1}
              </span>
              {renderEditor(spot)}
            </li>
          );
        }
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
              {/* 정산: any member may open the settlement editor (REQ F-정산). */}
              {onSettle && (
                <button
                  type="button"
                  className="link-button"
                  aria-label={`정산: ${spot.name}`}
                  onClick={() => onSettle(spot.id)}
                >
                  정산
                </button>
              )}
            </span>

            {/* Recommended/signature menu, inline per row (REQ-F4-002/003) so it
                is visible without opening the map marker. */}
            <div className="spot-menus" data-testid="spot-menus">
              {(menusBySpot[spot.id]?.length ?? 0) === 0 ? (
                <span className="muted spot-menus-empty">추천 메뉴 없음</span>
              ) : (
                <ul className="spot-menus-list">
                  {menusBySpot[spot.id]!.map((m) => (
                    <li key={m.id}>
                      <span className="spot-menu-text">
                        {m.menu_text || '(사진)'}
                      </span>
                      <span className="muted">
                        {' '}
                        — {m.author?.display_name ?? m.author_id}
                      </span>
                      {(m.images?.length ?? 0) > 0 && (
                        <div className="menu-thumbs">
                          {m.images!.map((img, imgIndex) => (
                            <button
                              type="button"
                              key={img.path}
                              className="menu-thumb"
                              aria-label={`사진 보기: ${m.menu_text || '메뉴'}`}
                              onClick={() =>
                                setViewer({
                                  images: m.images!.map((i) => ({
                                    url: i.url,
                                    alt: m.menu_text,
                                  })),
                                  index: imgIndex,
                                })
                              }
                            >
                              <img
                                src={img.url}
                                alt={m.menu_text}
                                loading="lazy"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Settlement caption (정산): full-width line below the row content,
                like the green distance caption. Lists each person's net for this
                spot, sign-aware (받을 +, 낼 −). 360px-safe (wraps). */}
            {settlement && settlementNets && (
              <span
                className="spot-settlement"
                data-testid={`spot-settlement-${spot.id}`}
              >
                <span className="spot-settlement-part">
                  정산 {formatWon(settlement.amount)}
                </span>
                {Object.entries(settlementNets).map(([userId, net]) => {
                  const isSettled = settledSet?.has(userId) ?? false;
                  return (
                    <span key={userId} className="spot-settlement-part">
                      {' · '}
                      {displayNameFor(userId, profileNames)}{' '}
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
                        {formatSignedWon(net)}
                      </span>
                      {isSettled && (
                        <span className="settlement-done-tag"> ✓완료</span>
                      )}
                    </span>
                  );
                })}
              </span>
            )}

            {/* Colored connector bridging to the next row — same color as this
                segment's line on the map, so the route is easy to follow across
                both views. Hidden for the last row. */}
            {index < sorted.length - 1 && (
              <span
                className="spot-connector"
                aria-hidden="true"
                data-testid={`spot-connector-${index}`}
                style={{ backgroundColor: segmentColor(index) }}
              />
            )}
          </li>
        );
      })}
    </ul>
    {viewer && (
      <ImageViewer
        images={viewer.images}
        index={viewer.index}
        onClose={() => setViewer(null)}
        onIndexChange={(next) =>
          setViewer((v) => (v ? { ...v, index: next } : v))
        }
      />
    )}
    </>
  );
}
