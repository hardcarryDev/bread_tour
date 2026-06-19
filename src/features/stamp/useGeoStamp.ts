// GPS auto-stamp hook (SPEC-BREADTOUR-001 / F1 + NFR-GEO).
//
// Wraps navigator.geolocation.watchPosition and turns the raw position stream
// into at most one stamp per sustained arrival. Responsibilities:
//   - secure-context guard (NFR-GEO-003): geolocation only under HTTPS
//   - permission purpose flow (NFR-GEO-001): expose the auto-stamp purpose to
//     the UI so it explains WHY before the browser prompt fires on start()
//   - permission/position-error fallback (NFR-GEO-002): disable auto-stamp,
//     leave the rest of the app working, surface a flag for the manual fallback
//   - accuracy-ratio gate (REQ-F1-006 / A10): hold + warn when accuracy is poor
//   - dwell-time gate (REQ-F1-002 / A9): require sustained presence
//   - overlap resolution (REQ-F1-008): one stamp = earliest unvisited spot
//   - tracking indicator + pause/stop (NFR-GEO-004/005)
//   - NO raw coordinate persistence (NFR-GEO-006 / A12): samples live only in
//     this hook's memory; the only thing emitted outward is a spot id
//
// `geolocation` and `isSecureContext` are injectable so the dwell/accuracy/
// overlap logic can be driven deterministically in tests without a real device.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Spot } from '../../types/database';
import {
  DEFAULT_DWELL,
  DwellTracker,
  accuracyOk,
  haversineMeters,
  resolveArrivalSpot,
  type DwellConfig,
  type GeoSample,
} from './geo';

// Purpose copy shown before the browser permission prompt (NFR-GEO-001).
export const GEO_PURPOSE =
  '도착 시 자동으로 스탬프를 적립하기 위해 위치 정보를 사용합니다.';

export interface UseGeoStampOptions {
  spots: Spot[];
  // Spots that already have a valid stamp for the current member (skip them).
  stampedSpotIds: ReadonlySet<string>;
  // Called exactly once per sustained arrival with the target spot id only.
  onStamp: (spotId: string) => void | Promise<void>;
  dwellConfig?: DwellConfig;
  // Injectable for tests; defaults to navigator.geolocation / window flag.
  geolocation?: Geolocation;
  isSecureContext?: boolean;
}

// In-memory position used only for live routing (directions to the next spot)
// and the map's "내 위치" indicator. This is NEVER persisted to the DB
// (NFR-GEO-006 / A12); it lives in hook state for as long as tracking is active
// and is cleared when tracking stops. `accuracy` is the latest fix's reported
// radius in metres (when the device provides it) so the map can draw a
// translucent accuracy circle; it is in-memory only, same as lat/lng.
export interface CurrentPosition {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface UseGeoStampResult {
  tracking: boolean;
  accuracyWarning: boolean;
  permissionDenied: boolean;
  error: string | null;
  purpose: string;
  // Latest in-memory GPS fix (lat/lng + optional accuracy in metres) while
  // tracking, or null when unknown. Used by directions to route from the user's
  // current location (REQ-F2-003) and by the map to show the live "내 위치"
  // marker + accuracy circle; it is intentionally in-memory only and never
  // stored (NFR-GEO-006 / A12).
  currentPosition: CurrentPosition | null;
  start: () => void;
  pause: () => void;
  stop: () => void;
}

const PERMISSION_DENIED = 1;

// @MX:ANCHOR: [AUTO] useGeoStamp is the single GPS-to-stamp pipeline; all
// arrival rules (secure ctx, permission, accuracy, dwell, overlap) funnel
// through here and it emits at most one onStamp per sustained arrival.
// @MX:REASON: REQ-F1-002/006/008 + NFR-GEO-001..006 — this is the only place
// raw position samples are seen; keeping the contract (spot-id-only emission,
// no coord persistence) here is what lets MapView/TourDetail and Slice D stay
// decoupled from the geolocation stream.
export function useGeoStamp(options: UseGeoStampOptions): UseGeoStampResult {
  const {
    spots,
    stampedSpotIds,
    onStamp,
    dwellConfig = DEFAULT_DWELL,
    geolocation,
    isSecureContext,
  } = options;

  const [tracking, setTracking] = useState(false);
  const [accuracyWarning, setAccuracyWarning] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // In-memory only; cleared on stop/pause. Never written to the DB (NFR-GEO-006).
  const [currentPosition, setCurrentPosition] =
    useState<CurrentPosition | null>(null);

  // Refs hold mutable per-watch state so the watch callback always sees the
  // latest values without re-subscribing. No coordinates are stored beyond the
  // dwell tracker's in-memory target id + timing (NFR-GEO-006).
  const watchIdRef = useRef<number | null>(null);
  const dwellRef = useRef(new DwellTracker(dwellConfig));
  const spotsRef = useRef(spots);
  const stampedRef = useRef(stampedSpotIds);
  const onStampRef = useRef(onStamp);
  const trackingRef = useRef(false);
  // Spot ids we have already emitted an onStamp() for during this watch, before
  // the parent's async reloadStamps() refreshes stampedSpotIds. This optimistic
  // guard closes the race window where a second in-radius sample fires a
  // duplicate createStamp (H-03 / AC-A4). It is per-watch in-memory state only.
  const optimisticStampedRef = useRef<Set<string>>(new Set());

  // Keep refs current without retriggering the watch subscription.
  spotsRef.current = spots;
  stampedRef.current = stampedSpotIds;
  onStampRef.current = onStamp;

  const resolveGeo = useCallback((): Geolocation | null => {
    if (geolocation) return geolocation;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      return navigator.geolocation;
    }
    return null;
  }, [geolocation]);

  const resolveSecure = useCallback((): boolean => {
    if (typeof isSecureContext === 'boolean') return isSecureContext;
    return typeof window !== 'undefined' ? window.isSecureContext : false;
  }, [isSecureContext]);

  const stopWatch = useCallback(() => {
    const geo = resolveGeo();
    if (watchIdRef.current !== null && geo) {
      geo.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    trackingRef.current = false;
    dwellRef.current.reset();
    optimisticStampedRef.current.clear();
    setTracking(false);
    // Drop the in-memory position so no coordinate lingers after tracking ends.
    setCurrentPosition(null);
  }, [resolveGeo]);

  const handleSample = useCallback((sample: GeoSample) => {
    if (!trackingRef.current) return; // ignore late callbacks after pause/stop
    // Record the latest fix in-memory for live routing (REQ-F2-003) and the
    // map's "내 위치" indicator. This is never persisted (NFR-GEO-006 / A12) and
    // is cleared when tracking stops. accuracy (metres) rides along so the map
    // can draw the accuracy circle; it stays in-memory like lat/lng.
    setCurrentPosition({
      lat: sample.lat,
      lng: sample.lng,
      accuracy: sample.accuracy,
    });
    // Treat spots we have already optimistically stamped this watch as visited,
    // so a second arrival before reloadStamps() refreshes stampedSpotIds does
    // not produce a duplicate onStamp (H-03 / AC-A4).
    const visited =
      optimisticStampedRef.current.size === 0
        ? stampedRef.current
        : new Set([...stampedRef.current, ...optimisticStampedRef.current]);
    const target = resolveArrivalSpot(sample, spotsRef.current, visited);

    if (!target) {
      dwellRef.current.update(null, sample.at);
      setAccuracyWarning(false);
      return;
    }

    // Accuracy gate (A10): hold the stamp and warn if the fix is too coarse.
    if (!accuracyOk(sample.accuracy, target.radius_m)) {
      // Still inside the radius geometrically, but accuracy is unreliable.
      const dist = haversineMeters(
        sample.lat,
        sample.lng,
        target.lat,
        target.lng,
      );
      if (dist <= target.radius_m) setAccuracyWarning(true);
      dwellRef.current.update(null, sample.at); // do not accumulate dwell
      return;
    }

    setAccuracyWarning(false);
    const arrived = dwellRef.current.update(target.id, sample.at);
    if (arrived) {
      dwellRef.current.reset();
      // Mark optimistically before the async onStamp/reload resolves so a
      // follow-up in-radius sample for the same spot is not re-stamped (H-03).
      optimisticStampedRef.current.add(target.id);
      void onStampRef.current(target.id);
    }
  }, []);

  const start = useCallback(() => {
    setError(null);
    setAccuracyWarning(false);
    setPermissionDenied(false);

    if (!resolveSecure()) {
      setError('위치 기능은 HTTPS(보안 컨텍스트)에서만 사용할 수 있습니다.');
      return;
    }
    const geo = resolveGeo();
    if (!geo) {
      setError('이 브라우저는 위치 정보를 지원하지 않습니다.');
      return;
    }
    if (watchIdRef.current !== null) return; // already tracking

    dwellRef.current = new DwellTracker(dwellConfig);
    optimisticStampedRef.current = new Set();
    trackingRef.current = true;
    setTracking(true);

    watchIdRef.current = geo.watchPosition(
      (pos) =>
        handleSample({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: pos.timestamp,
        }),
      (err) => {
        // Permission denied / position unavailable / timeout (NFR-GEO-002).
        if (err.code === PERMISSION_DENIED) setPermissionDenied(true);
        setError(err.message || '위치 정보를 사용할 수 없습니다.');
        stopWatch();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  }, [dwellConfig, handleSample, resolveGeo, resolveSecure, stopWatch]);

  // pause and stop both halt tracking; kept distinct so the UI can label them
  // (pause = temporary, stop = end session). Behaviour is identical here.
  const pause = useCallback(() => stopWatch(), [stopWatch]);
  const stop = useCallback(() => stopWatch(), [stopWatch]);

  // Clean up the watch on unmount so no stray callbacks fire.
  useEffect(() => () => stopWatch(), [stopWatch]);

  return {
    tracking,
    accuracyWarning,
    permissionDenied,
    error,
    purpose: GEO_PURPOSE,
    currentPosition,
    start,
    pause,
    stop,
  };
}
