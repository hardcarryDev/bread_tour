import { useState } from 'react';
import type { SpotKind } from '../../types/database';
import { errorMessage } from '../../lib/errors';
import LocationPicker, { type PickedLocation } from './LocationPicker';

export interface SpotFormValues {
  name: string;
  lat: number;
  lng: number;
  kind: SpotKind;
  menuText: string;
}

// Default 종류 options when a tour list is not supplied (e.g. in isolation /
// tests). In the app these come from the per-tour spot_kinds list (migration 10).
const DEFAULT_KINDS = ['빵집', '음식점'];

interface SpotFormProps {
  onSubmit: (values: SpotFormValues) => Promise<void> | void;
  onCancel: () => void;
  // Prefill for editing an existing spot. Menu is added separately (F4).
  initial?: {
    name?: string;
    lat?: number;
    lng?: number;
    kind?: SpotKind;
  };
  // Selectable 종류 options for this tour, and a persister for the "종류 추가"
  // button. Both optional so the form still works standalone.
  kinds?: string[];
  onAddKind?: (name: string) => Promise<void> | void;
}

// Spot registration / edit form (REQ-F1-001 data + REQ-F4-001 menu fields).
// Location capture (A8): the user opens an interactive Kakao map picker
// (LocationPicker) and either taps the map or searches for a place to set the
// real coordinate. Submit is blocked until a coordinate exists (AC-F1-06).
export default function SpotForm({
  onSubmit,
  onCancel,
  initial,
  kinds,
  onAddKind,
}: SpotFormProps) {
  const kindOptions = kinds && kinds.length > 0 ? kinds : DEFAULT_KINDS;
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<SpotKind>(
    initial?.kind ?? kindOptions[0] ?? '빵집',
  );
  // Inline "종류 추가" state: when adding, a small text input + 확인 replaces the
  // dropdown focus so a new category can be typed and persisted.
  const [addingKind, setAddingKind] = useState(false);
  const [newKind, setNewKind] = useState('');
  const [menuText, setMenuText] = useState('');
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(
    initial?.lat != null && initial?.lng != null
      ? { lat: initial.lat, lng: initial.lng }
      : null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Apply a coordinate chosen in the interactive picker. If the picker returned
  // a place name and the name field is still empty, prefill it (optional, A8).
  function handlePicked(location: PickedLocation) {
    setCoord({ lat: location.lat, lng: location.lng });
    if (location.name && name.trim().length === 0) {
      setName(location.name);
    }
    setError(null);
    setPickerOpen(false);
  }

  // Confirm the "종류 추가" inline input: persist the new option (if a persister
  // is supplied) and select it. Not a form submit — preventDefault keeps the
  // surrounding <form> from submitting on Enter.
  async function handleAddKind() {
    const value = newKind.trim();
    if (value.length === 0) return;
    try {
      if (!kindOptions.includes(value)) {
        await onAddKind?.(value);
      }
      setKind(value);
      setNewKind('');
      setAddingKind(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coord) {
      setError('지도에서 위치를 먼저 선택하세요.');
      return;
    }
    if (name.trim().length === 0) {
      setError('장소 이름을 입력하세요.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        lat: coord.lat,
        lng: coord.lng,
        // Never send a blank category (DB requires 1-50 chars); fall back to 빵집.
        kind: kind.trim() || '빵집',
        menuText: menuText.trim(),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="spot-form" onSubmit={handleSubmit}>
      <label>
        이름
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label>
        종류
        {/* Per-tour options (migration 10). "종류 추가" appends a new option to
            the tour's list so every member sees it. The selected kind is always
            present in the list even if it was later removed from the tour. */}
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {(kindOptions.includes(kind)
            ? kindOptions
            : [kind, ...kindOptions]
          ).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>

      {addingKind ? (
        <div className="spot-form-add-kind">
          <input
            type="text"
            value={newKind}
            data-testid="new-kind-input"
            onChange={(e) => setNewKind(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAddKind();
              }
            }}
            placeholder="새 종류 (예: 카페)"
            aria-label="새 종류 이름"
          />
          <button type="button" data-testid="confirm-add-kind" onClick={handleAddKind}>
            확인
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setAddingKind(false);
              setNewKind('');
            }}
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="link-button spot-form-add-kind-toggle"
          data-testid="add-kind"
          onClick={() => setAddingKind(true)}
        >
          + 종류 추가
        </button>
      )}

      <div className="spot-form-location">
        <button
          type="button"
          data-testid="pin-here"
          onClick={() => setPickerOpen(true)}
        >
          지도에서 위치 선택
        </button>
        {coord && (
          <span className="muted" data-testid="picked-coord">
            {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
          </span>
        )}
      </div>

      {pickerOpen && (
        <LocationPicker
          initial={coord ?? undefined}
          onConfirm={handlePicked}
          onCancel={() => setPickerOpen(false)}
        />
      )}

      <label>
        추천 메뉴 (선택)
        <input
          type="text"
          value={menuText}
          onChange={(e) => setMenuText(e.target.value)}
          placeholder="시그니처 메뉴 (비워둬도 됩니다)"
        />
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="spot-form-actions">
        <button type="submit" disabled={submitting}>
          저장
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  );
}
