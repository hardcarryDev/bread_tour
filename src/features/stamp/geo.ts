// Pure geolocation logic for GPS auto-stamping (SPEC-BREADTOUR-001 / F1).
//
// Everything here is side-effect free and deterministic so the arrival rules
// (dwell-time A9, accuracy gate A10, radius-overlap resolution REQ-F1-008) can
// be exercised with synthetic samples in tests. No coordinates are persisted by
// this module — it only decides whether/where a stamp should be produced from
// in-memory samples (NFR-GEO-006 / A12).

import type { Spot } from '../../types/database';

// A single position reading fed from navigator.geolocation. `accuracy` is the
// browser-reported accuracy radius in metres; `at` is a monotonic timestamp (ms).
export interface GeoSample {
  lat: number;
  lng: number;
  accuracy: number;
  at: number;
}

// Dwell-time configuration (A9). Defaults: 3 consecutive in-radius samples OR
// 10s of sustained presence, whichever comes first.
export interface DwellConfig {
  minConsecutive: number;
  minDwellMs: number;
}

export const DEFAULT_DWELL: DwellConfig = {
  minConsecutive: 3,
  minDwellMs: 10_000,
};

// Accuracy-ratio gate (A10). The reported accuracy must be strictly better than
// half the spot's arrival radius for an auto-stamp to be allowed.
export const ACCURACY_RATIO = 0.5;

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Great-circle distance between two coordinates, in metres.
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// REQ-F1-006 / A10: auto-stamp is only allowed when accuracy < radius * 0.5.
export function accuracyOk(accuracyM: number, radiusM: number): boolean {
  return accuracyM < radiusM * ACCURACY_RATIO;
}

// @MX:ANCHOR: [AUTO] resolveArrivalSpot is the single arrival-target decision
// point: from one position it returns at most ONE spot to stamp, preferring the
// earliest unvisited spot in visit order (distance as tie-break).
// @MX:REASON: REQ-F1-008 / AC-F1-05 — overlapping radii must never award
// multiple auto-stamps from a single position; useGeoStamp depends on this
// returning a single deterministic target so dwell-tracking stays coherent.
export function resolveArrivalSpot(
  sample: GeoSample,
  spots: Spot[],
  stampedSpotIds: ReadonlySet<string>,
): Spot | null {
  const inRange = spots
    .filter((s) => !stampedSpotIds.has(s.id))
    .map((s) => ({
      spot: s,
      dist: haversineMeters(sample.lat, sample.lng, s.lat, s.lng),
    }))
    .filter(({ spot, dist }) => dist <= spot.radius_m);

  if (inRange.length === 0) return null;

  // Earliest visit order wins; ties broken by closer center distance.
  inRange.sort((a, b) => {
    if (a.spot.order_index !== b.spot.order_index) {
      return a.spot.order_index - b.spot.order_index;
    }
    return a.dist - b.dist;
  });

  return inRange[0].spot;
}

// Tracks how long the user has continuously satisfied the in-radius condition
// for a single target spot, enforcing the dwell-time gate (A9). It holds only a
// target id + timing in memory (no coordinate history) per NFR-GEO-006.
//
// @MX:ANCHOR: [AUTO] DwellTracker is the arrival debounce contract — a stamp is
// only signalled after consecutive samples OR sustained dwell on the SAME spot.
// @MX:REASON: REQ-F1-002 / A9 / NFR-PERF-003 — without this gate a single noisy
// GPS spike (urban multipath) would mis-stamp; useGeoStamp relies on update()
// returning true exactly once per sustained arrival.
export class DwellTracker {
  private readonly cfg: DwellConfig;
  private targetId: string | null = null;
  private count = 0;
  private firstAt = 0;

  constructor(cfg: DwellConfig = DEFAULT_DWELL) {
    this.cfg = cfg;
  }

  // Feed the current arrival target (spot id, or null if outside all radii) and
  // the sample timestamp. Returns true when the dwell condition is satisfied.
  update(spotId: string | null, at: number): boolean {
    if (spotId === null || spotId !== this.targetId) {
      // Left the radius or switched target: restart the streak.
      this.targetId = spotId;
      this.count = spotId === null ? 0 : 1;
      this.firstAt = at;
      return false;
    }
    this.count += 1;
    const dwelledMs = at - this.firstAt;
    return (
      this.count >= this.cfg.minConsecutive || dwelledMs >= this.cfg.minDwellMs
    );
  }

  reset(): void {
    this.targetId = null;
    this.count = 0;
    this.firstAt = 0;
  }
}
