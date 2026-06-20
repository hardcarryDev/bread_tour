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
}

// Spot registration / edit form (REQ-F1-001 data + REQ-F4-001 menu fields).
// Location capture (A8): the user opens an interactive Kakao map picker
// (LocationPicker) and either taps the map or searches for a place to set the
// real coordinate. Submit is blocked until a coordinate exists (AC-F1-06).
export default function SpotForm({ onSubmit, onCancel, initial }: SpotFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<SpotKind>(initial?.kind ?? '빵집');
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
        {/* Free text (migration 9): 빵집/음식점 are quick suggestions via the
            datalist, but members can type any category (카페, 디저트, ...). */}
        <input
          type="text"
          list="spot-kind-options"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          placeholder="예: 빵집, 음식점, 카페"
        />
        <datalist id="spot-kind-options">
          <option value="빵집" />
          <option value="음식점" />
          <option value="카페" />
          <option value="디저트" />
        </datalist>
      </label>

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
