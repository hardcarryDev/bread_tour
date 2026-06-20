// Pure routing helpers for directions (SPEC-BREADTOUR-001 / F2).
//
// Distance/time formatting (REQ-F2-002) and the straight-line fallback (A11)
// used when the Kakao route API returns no usable route. Side-effect free so
// the formatting + fallback math is fully unit-testable.

import { haversineMeters } from '../stamp/geo';

export interface LatLng {
  lat: number;
  lng: number;
}

// Travel modes supported by the directions Edge Function.
//   - "car"     -> Kakao Mobility
//   - "walk"    -> TMAP pedestrian
//   - "transit" -> TMAP public transit
export type TravelMode = 'car' | 'walk' | 'transit';

// Per-leg breakdown for transit routes so the UI can show the itinerary
// (bus/subway/walk segments). Present only for mode "transit".
export interface RouteLeg {
  mode: string;
  sectionTime: number;
  distance?: number;
  route?: string;
  startName?: string;
  endName?: string;
}

export interface RouteResult {
  // Travel mode of this result. Optional for backward compatibility: older
  // car-only responses (and the straight-line fallback) may omit it.
  mode?: TravelMode;
  // Polyline points to draw on the map (in order).
  path: LatLng[];
  distanceM: number;
  durationSec: number;
  // True when this came from the straight-line fallback (A11) rather than a
  // routing provider (Kakao/TMAP).
  fallback: boolean;
  // Transit-only fields (omitted for car & walk).
  legs?: RouteLeg[];
  fare?: number;
  transferCount?: number;
  totalWalkTime?: number;
  // Per-waypoint-segment geometry for a whole-tour route (getPathRoute). Index i
  // is the road path from spot i to spot i+1, so the map can draw each segment
  // in its own color (matching the spot-list connectors). Absent for single
  // point-to-point routes.
  legPaths?: LatLng[][];
}

// Average walking speed (m/s) used to estimate time for the straight-line
// fallback when Kakao provides no route/duration (A11). ~4.8 km/h.
const WALK_SPEED_MPS = 1.33;

// REQ-F2-002: present the route distance. Metres under 1km, km with one decimal
// at or above 1km.
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// REQ-F2-002: present the estimated time in whole minutes (minimum 1 minute).
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes}분`;
}

// Straight-line fallback (A11): a direct A->B segment with haversine distance
// and a walking-speed time estimate. Used when Kakao returns no route or the
// route API call fails but we still want a usable estimate.
export function straightLineRoute(from: LatLng, to: LatLng): RouteResult {
  const distanceM = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  return {
    path: [from, to],
    distanceM,
    durationSec: distanceM / WALK_SPEED_MPS,
    fallback: true,
  };
}
