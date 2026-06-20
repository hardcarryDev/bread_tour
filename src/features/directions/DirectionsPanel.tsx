// Directions control (SPEC-BREADTOUR-001 / F2).
//
// Lets a member request a route between two spots (REQ-F2-001) or from their
// current location to the next unvisited spot in visit order (REQ-F2-003), and
// shows the distance + estimated minutes (REQ-F2-002). The member picks a travel
// mode (도보 / 대중교통 / 차 = walk / transit / car) like the KakaoMap app's mode
// tabs; the chosen mode is forwarded to getRoute, which selects the routing
// provider server-side (car=Kakao, walk/transit=TMAP).
//
// The computed RouteResult is handed up via onRoute so the map can draw the
// polyline; getRoute already degrades to a straight-line estimate on API failure
// (REQ-F2-004 / A11), so this panel never blanks the map — it just annotates the
// fallback. For walk/transit, a straight-line fallback also means "TMAP not
// configured or no route", which we surface as a clear, mode-aware message
// instead of a raw error.

import { useMemo, useState } from 'react';
import type { Spot } from '../../types/database';
import { getRoute } from './api';
import {
  formatDistance,
  formatDuration,
  type LatLng,
  type RouteLeg,
  type RouteResult,
  type TravelMode,
} from './route';

interface DirectionsPanelProps {
  spots: Spot[];
  // Emits the computed route so the parent/map can render its polyline.
  onRoute: (route: RouteResult) => void;
  // Optional controlled travel mode. When `mode` + `onModeChange` are provided,
  // the panel is controlled and the parent owns the selected mode so it can be
  // shared with the "내기준정렬" button (which routes with the same mode). When
  // omitted, the panel keeps its own internal mode state (default 차/car) and
  // behaves exactly as before.
  mode?: TravelMode;
  onModeChange?: (mode: TravelMode) => void;
}

// Travel-mode tab definitions, ordered like the KakaoMap app: 도보 / 대중교통 / 차.
const MODE_TABS: ReadonlyArray<{ mode: TravelMode; label: string }> = [
  { mode: 'walk', label: '도보' },
  { mode: 'transit', label: '대중교통' },
  { mode: 'car', label: '차' },
];

// Human-readable "X 기준" caption per mode (shown for real, non-fallback routes).
const MODE_BASIS_LABEL: Record<TravelMode, string> = {
  walk: '도보 기준',
  transit: '대중교통 기준',
  car: '자동차 기준',
};

// Map a TMAP leg.mode token to a compact Korean label. Unknown tokens pass
// through unchanged so a new transit type is still legible.
function legModeLabel(mode: string): string {
  switch (mode.toUpperCase()) {
    case 'WALK':
      return '도보';
    case 'BUS':
      return '버스';
    case 'SUBWAY':
      return '지하철';
    case 'EXPRESSBUS':
      return '고속버스';
    case 'TRAIN':
      return '기차';
    default:
      return mode;
  }
}

// One transit leg rendered as e.g. "버스 간선 102 (10분)" / "도보 5분".
function describeLeg(leg: RouteLeg): string {
  const label = legModeLabel(leg.mode);
  const minutes = formatDuration(leg.sectionTime);
  if (leg.route) return `${label} ${leg.route} (${minutes})`;
  return `${label} ${minutes}`;
}

export default function DirectionsPanel({
  spots,
  onRoute,
  mode: controlledMode,
  onModeChange,
}: DirectionsPanelProps) {
  const ordered = useMemo(
    () => [...spots].sort((a, b) => a.order_index - b.order_index),
    [spots],
  );
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  // Controlled when the parent supplies `mode`; otherwise keep internal state so
  // standalone usage (and existing tests) work unchanged. Default stays 차/car.
  const [internalMode, setInternalMode] = useState<TravelMode>('car');
  const isControlled = controlledMode != null;
  const mode = isControlled ? controlledMode : internalMode;
  const setMode = (next: TravelMode) => {
    if (isControlled) onModeChange?.(next);
    else setInternalMode(next);
  };
  const [route, setRoute] = useState<RouteResult | null>(null);
  // The mode that was requested for the currently shown route — used to caption
  // a fallback correctly (e.g. a walk request that fell back to a straight line).
  const [routeMode, setRouteMode] = useState<TravelMode>('car');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runRoute(from: LatLng, to: LatLng) {
    setBusy(true);
    setError(null);
    const requested = mode;
    try {
      const result = await getRoute(from, to, { mode: requested });
      setRoute(result);
      setRouteMode(requested);
      onRoute(result);
    } catch (e) {
      // getRoute is designed not to throw, but guard anyway (REQ-F2-004).
      setError(e instanceof Error ? e.message : '길찾기에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  function handleRouteBetween() {
    const from = ordered.find((s) => s.id === fromId);
    const to = ordered.find((s) => s.id === toId);
    if (!from || !to) {
      setError('출발/도착 장소를 선택하세요.');
      return;
    }
    void runRoute(
      { lat: from.lat, lng: from.lng },
      { lat: to.lat, lng: to.lng },
    );
  }

  // A successful route reports its own mode; otherwise fall back to whatever the
  // member requested. The straight-line fallback carries no mode.
  const resolvedMode: TravelMode = route?.mode ?? routeMode;
  const isTransit = !route?.fallback && route?.mode === 'transit';

  return (
    <div className="directions-panel" aria-label="길찾기">
      {/* From / To selects stacked in one block, with 길찾기 alongside them. */}
      <div className="directions-controls">
        <div className="directions-fields">
          <label className="directions-field">
            <span className="directions-field-label">출발 장소</span>
            <select
              aria-label="출발 장소"
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
            >
              <option value="">선택</option>
              {ordered.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="directions-field">
            <span className="directions-field-label">도착 장소</span>
            <select
              aria-label="도착 장소"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
            >
              <option value="">선택</option>
              {ordered.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="directions-go"
          onClick={handleRouteBetween}
          disabled={busy}
        >
          길찾기
        </button>
      </div>

      {/* Travel-mode tabs (도보 / 대중교통 / 차), placed below 길찾기. */}
      <div className="mode-tabs" role="group" aria-label="이동 수단 선택">
        {MODE_TABS.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            className="mode-tab"
            aria-pressed={mode === tab.mode}
            onClick={() => setMode(tab.mode)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error} 지도와 장소는 계속 확인할 수 있습니다.
        </p>
      )}

      {route && (
        <div className="route-summary">
          {/* Mode caption. A real route (fallback:false) is labelled by its
              actual mode ("도보/대중교통/자동차 기준"). The straight-line fallback
              (A11) is NOT a real route, so it gets no mode label — the fallback
              note below explains it instead. */}
          {!route.fallback && (
            <span data-testid="route-mode">
              {MODE_BASIS_LABEL[resolvedMode]}
            </span>
          )}
          <span data-testid="route-distance">
            거리: {formatDistance(route.distanceM)}
          </span>
          <span data-testid="route-duration">
            예상 시간: {formatDuration(route.durationSec)}
          </span>

          {/* Transit itinerary breakdown: a readable sequence of legs plus the
              transfer count and fare when present. */}
          {isTransit && route.legs && route.legs.length > 0 && (
            <div
              className="route-legs"
              data-testid="route-legs"
              role="list"
              aria-label="대중교통 경로 단계"
            >
              {route.legs.map((leg, i) => (
                <span key={i} className="route-leg-group">
                  {i > 0 && (
                    <span className="route-leg-sep" aria-hidden="true">
                      {' → '}
                    </span>
                  )}
                  <span className="route-leg" role="listitem">
                    {describeLeg(leg)}
                  </span>
                </span>
              ))}
            </div>
          )}
          {isTransit &&
            (route.transferCount != null || route.fare != null) && (
              <span className="muted" data-testid="route-transit-meta">
                {route.transferCount != null &&
                  `환승 ${route.transferCount}회`}
                {route.transferCount != null && route.fare != null && ' · '}
                {route.fare != null &&
                  `${route.fare.toLocaleString('ko-KR')}원`}
              </span>
            )}

          {/* Fallback caption (A11). For walk/transit a straight-line fallback
              means TMAP is unconfigured or no route was found; say so clearly and
              still show the straight-line estimate above. For car it is just a
              rough straight-line estimate. */}
          {route.fallback && (
            <span className="muted" data-testid="route-fallback">
              {routeMode === 'car'
                ? '(직선 거리 기준 추정)'
                : '도보/대중교통 경로를 불러올 수 없습니다 (TMAP 미설정이거나 경로 없음). 직선 거리로 표시합니다.'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
