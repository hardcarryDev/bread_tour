import { useEffect, useRef, useState } from 'react';
import { loadKakaoMaps } from '../../lib/kakao';
import type { Spot } from '../../types/database';
import type { LatLng } from '../directions/route';
import type { SpotMenuWithAuthor } from '../menu/api';
import { segmentColor } from './spotColors';

// Slice C plugs real stamp status in here; Slice B shows a neutral placeholder.
// Keeping it a prop keeps the marker-summary contract stable across slices.
export type SpotStampStatus = { stamped: boolean; arrivedAt?: string | null };

interface MapViewProps {
  spots: Spot[];
  // spot_id -> recommended menus (with contributor). Optional; empty => "없음".
  menusBySpot?: Record<string, SpotMenuWithAuthor[]>;
  // spot_id -> stamp status. Wired by Slice C; absent => neutral placeholder.
  stampBySpot?: Record<string, SpotStampStatus>;
  // Real road route to draw (REQ-F2-001): the decoded Kakao road polyline from
  // DirectionsPanel/getRoute. Drawn as a distinct blue line over the gray
  // spot-order connector. undefined => no route overlay (cleared).
  routePath?: LatLng[];
  // Live "내 위치" indicator while GPS tracking is active. lat/lng position the
  // marker; optional accuracy (metres) draws a translucent accuracy circle.
  // null/undefined => no marker (tracking off / position unknown). The value is
  // in-memory only and never persisted (NFR-GEO-006 / A12); MapView just renders
  // it and does not store it. It is intentionally NOT part of the spot-order
  // polyline or setBounds so spot framing is unaffected.
  currentLocation?: { lat: number; lng: number; accuracy?: number } | null;
}

// @MX:ANCHOR: [AUTO] MapView is the single Kakao rendering surface for the tour
// (markers + numbered order overlays + connecting route line + live "내 위치"
// indicator + tap summary).
// @MX:REASON: REQ-F3-001..004 — markers, order numbers, route redraw on reorder,
// the live location marker, and the tap summary are all anchored here; downstream
// slices (C stamp status, D realtime) extend it via props rather than
// re-implementing the map. Each overlay class (spots, route, my-location) is
// managed in its own effect/ref so they update/clear independently.
export default function MapView({
  spots,
  menusBySpot = {},
  stampBySpot = {},
  routePath,
  currentLocation,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const kakaoRef = useRef<KakaoNamespace | null>(null);
  const drawnRef = useRef<{ setMap(map: KakaoMap | null): void }[]>([]);
  // Route polyline is tracked separately from spot markers/order line so it can
  // be replaced/cleared on each new route without redrawing the whole map.
  const routeLineRef = useRef<{ setMap(map: KakaoMap | null): void } | null>(
    null,
  );
  // "내 위치" overlays (blue dot + optional accuracy circle) are tracked in their
  // own refs so they update/clear independently of the spot markers and route.
  const meDotRef = useRef<KakaoCircle | null>(null);
  const meAccuracyRef = useRef<KakaoCircle | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Spot | null>(null);

  // Load the Kakao SDK once and create the map instance.
  useEffect(() => {
    let active = true;
    loadKakaoMaps()
      .then((kakao) => {
        if (!active || !containerRef.current) return;
        kakaoRef.current = kakao;
        const center = new kakao.maps.LatLng(
          spots[0]?.lat ?? 37.5665,
          spots[0]?.lng ?? 126.978,
        );
        mapRef.current = new kakao.maps.Map(containerRef.current, {
          center,
          level: 5,
        });
        setReady(true);
      })
      .catch((e: unknown) => {
        if (active) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
    // Only the initial mount creates the map; redraw is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)draw markers + numbered overlays + route line whenever spots change.
  // This satisfies REQ-F3-003 (redraw on reorder) by keying on `spots`.
  useEffect(() => {
    if (!ready || !kakaoRef.current || !mapRef.current) return;
    const kakao = kakaoRef.current;
    const map = mapRef.current;

    // Clear previously drawn objects before redrawing in the new order.
    for (const obj of drawnRef.current) obj.setMap(null);
    drawnRef.current = [];

    const ordered = [...spots].sort((a, b) => a.order_index - b.order_index);
    const path: KakaoLatLng[] = [];

    ordered.forEach((spot, index) => {
      const pos = new kakao.maps.LatLng(spot.lat, spot.lng);
      path.push(pos);

      const marker = new kakao.maps.Marker({ position: pos, title: spot.name });
      marker.setMap(map);
      kakao.maps.event.addListener(marker, 'click', () => setSelected(spot));
      drawnRef.current.push(marker);

      // Numbered visit-order badge (REQ-F3-002 / AC-F3-01).
      const overlay = new kakao.maps.CustomOverlay({
        position: pos,
        content: String(index + 1),
        yAnchor: 1,
        zIndex: 3,
      });
      overlay.setMap(map);
      drawnRef.current.push(overlay);
    });

    // Draw each visit-order segment (spot i -> i+1) as its OWN polyline in a
    // distinct color (segmentColor) so overlapping legs are easy to tell apart
    // instead of one indistinguishable orange line. The colors match the
    // spot-list row connectors.
    for (let i = 0; i < path.length - 1; i++) {
      const segment = new kakao.maps.Polyline({
        path: [path[i], path[i + 1]],
        strokeWeight: 5,
        strokeColor: segmentColor(i),
        strokeOpacity: 0.9,
      });
      segment.setMap(map);
      drawnRef.current.push(segment);
    }

    // Fit the viewport to all spots.
    if (path.length > 0) {
      const bounds = new kakao.maps.LatLngBounds();
      for (const p of path) bounds.extend(p);
      map.setBounds(bounds);
    }
  }, [ready, spots]);

  // Draw / replace / clear the real road route polyline (REQ-F2-001). Kept in a
  // separate effect (and ref) from the spot-order line so requesting a new route
  // or clearing it does not disturb the markers/order connector. The route line
  // uses a distinct blue color + heavier weight so the actual road curve is
  // visually separable from the gray straight spot-order line; a fallback path
  // is just [from,to] and naturally renders straight (that is expected).
  useEffect(() => {
    if (!ready || !kakaoRef.current || !mapRef.current) return;
    const kakao = kakaoRef.current;
    const map = mapRef.current;

    // Remove any previously drawn route before drawing the new one / clearing.
    if (routeLineRef.current) {
      routeLineRef.current.setMap(null);
      routeLineRef.current = null;
    }

    if (!routePath || routePath.length < 2) return;

    const line = new kakao.maps.Polyline({
      path: routePath.map((p) => new kakao.maps.LatLng(p.lat, p.lng)),
      strokeWeight: 6,
      strokeColor: '#2563eb',
      strokeOpacity: 0.9,
      zIndex: 5,
    });
    line.setMap(map);
    routeLineRef.current = line;
  }, [ready, routePath]);

  // Draw / move / clear the live "내 위치" indicator. The marker is a small
  // filled blue dot with a white-ish ring (visually distinct from the amber
  // numbered spot pins), plus an optional translucent accuracy circle when the
  // fix reports an accuracy radius. Kept in its own effect/refs so updating the
  // position just moves the existing overlays (no redraw of spots/route), and
  // setting currentLocation to null (tracking stopped) removes them. This marker
  // is intentionally NOT added to the spot-order polyline or setBounds, so spot
  // framing is unchanged (per requirement).
  useEffect(() => {
    if (!ready || !kakaoRef.current || !mapRef.current) return;
    const kakao = kakaoRef.current;
    const map = mapRef.current;

    // No live position: remove any existing "내 위치" overlays and stop.
    if (!currentLocation) {
      if (meAccuracyRef.current) {
        meAccuracyRef.current.setMap(null);
        meAccuracyRef.current = null;
      }
      if (meDotRef.current) {
        meDotRef.current.setMap(null);
        meDotRef.current = null;
      }
      return;
    }

    const center = new kakao.maps.LatLng(
      currentLocation.lat,
      currentLocation.lng,
    );
    const hasAccuracy =
      typeof currentLocation.accuracy === 'number' &&
      currentLocation.accuracy > 0;

    // Accuracy circle (optional): a translucent blue disc of the fix's radius.
    if (hasAccuracy) {
      const radius = currentLocation.accuracy as number;
      if (meAccuracyRef.current) {
        meAccuracyRef.current.setPosition(center);
        meAccuracyRef.current.setRadius(radius);
      } else {
        const circle = new kakao.maps.Circle({
          center,
          radius,
          strokeWeight: 1,
          strokeColor: '#2563eb',
          strokeOpacity: 0.4,
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
          zIndex: 4,
        });
        circle.setMap(map);
        meAccuracyRef.current = circle;
      }
    } else if (meAccuracyRef.current) {
      // Accuracy went away (e.g. a later fix without accuracy): drop the circle.
      meAccuracyRef.current.setMap(null);
      meAccuracyRef.current = null;
    }

    // Blue location dot: a small fixed-radius filled circle. Drawn above the
    // accuracy circle so the precise point stays visible.
    const DOT_RADIUS_M = 6;
    if (meDotRef.current) {
      meDotRef.current.setPosition(center);
    } else {
      const dot = new kakao.maps.Circle({
        center,
        radius: DOT_RADIUS_M,
        strokeWeight: 2,
        strokeColor: '#ffffff',
        strokeOpacity: 0.9,
        fillColor: '#2563eb',
        fillOpacity: 1,
        zIndex: 6,
      });
      dot.setMap(map);
      meDotRef.current = dot;
    }
  }, [ready, currentLocation]);

  // Clean up the route polyline and "내 위치" overlays on unmount.
  useEffect(() => {
    return () => {
      if (routeLineRef.current) {
        routeLineRef.current.setMap(null);
        routeLineRef.current = null;
      }
      if (meAccuracyRef.current) {
        meAccuracyRef.current.setMap(null);
        meAccuracyRef.current = null;
      }
      if (meDotRef.current) {
        meDotRef.current.setMap(null);
        meDotRef.current = null;
      }
    };
  }, []);

  if (loadError) {
    return (
      <div className="map-view map-view-error" role="alert">
        지도를 불러오지 못했습니다. 장소 목록은 계속 사용할 수 있습니다.
      </div>
    );
  }

  const selectedMenus = selected ? (menusBySpot[selected.id] ?? []) : [];
  const selectedStamp = selected ? stampBySpot[selected.id] : undefined;
  const selectedOrder = selected
    ? [...spots].sort((a, b) => a.order_index - b.order_index).findIndex(
        (s) => s.id === selected.id,
      ) + 1
    : 0;

  return (
    <div className="map-view">
      <div
        ref={containerRef}
        className="map-canvas"
        data-testid="map-canvas"
        aria-label="투어 지도"
      />

      {selected && (
        <div
          className="marker-summary"
          data-testid="marker-summary"
          role="dialog"
          aria-label={`${selected.name} 요약`}
        >
          <button
            type="button"
            className="marker-summary-close link-button"
            onClick={() => setSelected(null)}
            aria-label="요약 닫기"
          >
            닫기
          </button>
          <h3>{selected.name}</h3>
          <p className="muted">방문 순서: {selectedOrder}</p>

          <div className="marker-menus">
            <strong>추천 메뉴</strong>
            {selectedMenus.length === 0 ? (
              <p className="muted">추천 메뉴 없음</p>
            ) : (
              <ul>
                {selectedMenus.map((m) => (
                  <li key={m.id}>
                    {m.menu_text}
                    <span className="muted">
                      {' '}
                      — {m.author?.display_name ?? m.author_id}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Stamp status placeholder. Slice C fills arrival/time in here. */}
          <p className="marker-stamp" data-testid="marker-stamp-status">
            스탬프:{' '}
            {selectedStamp
              ? selectedStamp.stamped
                ? '획득'
                : '미획득'
              : '-'}
          </p>
        </div>
      )}
    </div>
  );
}
