import { useRef, useState } from 'react';
import type { Spot } from '../../types/database';

interface SpotReorderProps {
  spots: Spot[];
  // Apply the new visit order (persisted by the caller via reorder_spots).
  onApply: (orderedIds: string[]) => void;
  // Leave reorder mode without applying.
  onCancel: () => void;
}

// Move a block of ids to a drop gap, preserving the block's internal order.
// `dropIndex` is an insertion gap in the FULL `order` coordinate space (0..len).
// Exported for unit testing the reorder math without the DOM/pointer layer.
export function computeBlockReorder(
  order: string[],
  movingIds: string[],
  dropIndex: number,
): string[] {
  const moving = new Set(movingIds);
  // The block in its current relative order (not the click/selection order).
  const block = order.filter((id) => moving.has(id));
  const rest = order.filter((id) => !moving.has(id));
  // Translate the full-coordinate gap into a `rest` index by discounting any
  // moving items that sit before the gap.
  const before = order.slice(0, dropIndex).filter((id) => moving.has(id)).length;
  const insertAt = Math.max(0, Math.min(dropIndex - before, rest.length));
  return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
}

// Reorder mode: a selectable, drag-and-drop list. Members check one or more
// rows (the circle on the left), drag any handle to move the whole selection as
// a block, and press 확인 to persist (AC-F5-06). 취소 discards the draft. Uses
// Pointer Events so it works with both touch (mobile-first) and mouse.
export default function SpotReorder({
  spots,
  onApply,
  onCancel,
}: SpotReorderProps) {
  const planOrdered = [...spots].sort((a, b) => a.order_index - b.order_index);
  const [draft, setDraft] = useState<Spot[]>(planOrdered);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // ids currently being dragged (a block); null when not dragging.
  const [draggingIds, setDraggingIds] = useState<string[] | null>(null);
  // Insertion gap index (0..len) where the block would drop; null when idle.
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Gap index from a pointer Y: count rows whose vertical midpoint is above Y.
  function gapFromPointer(clientY: number): number {
    let idx = draft.length;
    for (let i = 0; i < draft.length; i++) {
      const el = rowRefs.current.get(draft[i].id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) {
        idx = i;
        break;
      }
    }
    return idx;
  }

  function handlePointerDown(e: React.PointerEvent, rowId: string) {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    // Grabbing a selected row moves the whole selection; grabbing an unselected
    // row moves just that row.
    const ids =
      selected.has(rowId) && selected.size > 0
        ? draft.filter((s) => selected.has(s.id)).map((s) => s.id)
        : [rowId];
    setDraggingIds(ids);
    setDropIndex(gapFromPointer(e.clientY));
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!draggingIds) return;
    setDropIndex(gapFromPointer(e.clientY));
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!draggingIds || dropIndex == null) {
      setDraggingIds(null);
      setDropIndex(null);
      return;
    }
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    const ids = draft.map((s) => s.id);
    const nextIds = computeBlockReorder(ids, draggingIds, dropIndex);
    const byId = new Map(draft.map((s) => [s.id, s]));
    setDraft(nextIds.map((id) => byId.get(id)!));
    setDraggingIds(null);
    setDropIndex(null);
  }

  return (
    <div className="spot-reorder" data-testid="spot-reorder">
      <div className="spot-reorder-actions">
        <span className="muted">
          행을 선택하고 손잡이를 끌어 순서를 바꾼 뒤 확인을 누르세요.
        </span>
        <div className="spot-reorder-buttons">
          <button
            type="button"
            data-testid="reorder-apply"
            onClick={() => onApply(draft.map((s) => s.id))}
          >
            확인
          </button>
          <button
            type="button"
            className="link-button"
            data-testid="reorder-cancel"
            onClick={onCancel}
          >
            취소
          </button>
        </div>
      </div>

      <ul className="spot-list spot-reorder-list">
        {draft.map((spot, index) => {
          const isDragging = draggingIds?.includes(spot.id) ?? false;
          return (
            <li
              key={spot.id}
              ref={(el) => {
                if (el) rowRefs.current.set(spot.id, el);
                else rowRefs.current.delete(spot.id);
              }}
              className={[
                'spot-list-item',
                'spot-reorder-item',
                isDragging ? 'is-dragging' : '',
                dropIndex === index ? 'drop-before' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={selected.has(spot.id)}
                aria-label={`선택: ${spot.name}`}
                data-testid={`reorder-select-${spot.id}`}
                className={`spot-reorder-check${
                  selected.has(spot.id) ? ' checked' : ''
                }`}
                onClick={() => toggleSelected(spot.id)}
              />
              <span className="spot-order" aria-hidden="true">
                {index + 1}
              </span>
              <span className="spot-name">{spot.name}</span>
              <span className="muted spot-kind">{spot.kind}</span>
              <button
                type="button"
                className="spot-reorder-handle"
                aria-label={`순서 이동 손잡이: ${spot.name}`}
                data-testid={`reorder-handle-${spot.id}`}
                onPointerDown={(e) => handlePointerDown(e, spot.id)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                ≡
              </button>
            </li>
          );
        })}
        {/* Trailing drop indicator when dropping at the very end. */}
        {dropIndex === draft.length && (
          <li className="spot-reorder-drop-end" aria-hidden="true" />
        )}
      </ul>
    </div>
  );
}
