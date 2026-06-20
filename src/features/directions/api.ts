// Directions data layer (SPEC-BREADTOUR-001 / F2).
//
// getRoute asks for a car route between two coordinates and returns a drawable
// RouteResult (path + distance + duration). Two safety nets keep the map usable
// per REQ-F2-004 / A11:
//   - if no usable route is returned -> straight-line fallback (A11)
//   - if the route call throws (network/auth/API failure) -> straight-line
//     fallback instead of propagating, so markers/map stay interactive (AC-F2-03)
//
// Transport: the DEFAULT transport calls the `directions` Supabase Edge Function
// via supabase.functions.invoke. That function holds the Kakao REST API key as a
// server secret and proxies Kakao Mobility server-side, so the REST key is NEVER
// in the client bundle (NFR-SEC). functions.invoke automatically attaches the
// logged-in user's JWT, so only authenticated members can request routes; the
// function rejects unauthenticated callers with 401 (the client then falls back).
//
// The Kakao JavaScript map key (VITE_KAKAO_MAP_APP_KEY) is unrelated and still
// used client-side for map rendering — it is NOT used for directions REST here.
//
// The transport (`fetchRoute`) is injectable so tests never hit the live Edge
// Function. It returns a normalized RouteResult (the Edge Function does the
// Kakao->RouteResult normalization server-side).

import { supabase } from '../../lib/supabase';
import {
  straightLineRoute,
  type LatLng,
  type RouteResult,
  type TravelMode,
} from './route';

// Transport returns a normalized RouteResult or throws on failure so getRoute
// can apply the straight-line fallback. `mode` selects the routing provider
// server-side (car=Kakao, walk/transit=TMAP); defaults to "car".
type FetchRoute = (
  from: LatLng,
  to: LatLng,
  mode: TravelMode,
) => Promise<RouteResult>;

// Default transport: invoke the `directions` Edge Function. supabase-js attaches
// the user's auth automatically. Throws on function error or non-success body so
// getRoute applies the fallback.
const defaultFetchRoute: FetchRoute = async (from, to, mode) => {
  const { data, error } = await supabase.functions.invoke<RouteResult>(
    'directions',
    { body: { origin: from, destination: to, mode } },
  );
  if (error) {
    throw new Error(`directions function failed: ${error.message}`);
  }
  if (!data || !Array.isArray(data.path)) {
    throw new Error('directions function returned no route');
  }
  return data;
};

// @MX:ANCHOR: [AUTO] getRoute is the single directions entry point; it always
// resolves to a drawable RouteResult, degrading to a straight line on empty
// results or transport failure rather than throwing.
// @MX:REASON: REQ-F2-001/002/004 / A11 — the map must stay usable even when the
// directions Edge Function or Kakao fails; callers (DirectionsPanel) rely on
// this never rejecting so a failed route never blanks the markers.
export async function getRoute(
  from: LatLng,
  to: LatLng,
  opts: { fetchRoute?: FetchRoute; mode?: TravelMode } = {},
): Promise<RouteResult> {
  const fetchRoute = opts.fetchRoute ?? defaultFetchRoute;
  const mode = opts.mode ?? 'car';
  try {
    const result = await fetchRoute(from, to, mode);
    if (!result.path || result.path.length < 2) {
      // No usable route -> straight-line fallback (A11).
      return straightLineRoute(from, to);
    }
    return result;
  } catch {
    // Transport failure (REQ-F2-004): keep the map usable with a straight line.
    return straightLineRoute(from, to);
  }
}

// Route through an ordered list of waypoints (the whole tour: 1->2->3->...),
// returning one concatenated RouteResult so the map can draw the road-following
// path instead of the straight visit-order connector (REQ-F2-001). Each leg
// uses getRoute, so any failed leg degrades to a straight segment without
// breaking the rest. Legs run in parallel; the duplicated junction point
// between consecutive legs is dropped when concatenating.
export async function getPathRoute(
  points: LatLng[],
  opts: { fetchRoute?: FetchRoute; mode?: TravelMode } = {},
): Promise<RouteResult> {
  const mode = opts.mode ?? 'car';
  if (points.length < 2) {
    return { path: [...points], distanceM: 0, durationSec: 0, fallback: true, mode };
  }
  const legs = await Promise.all(
    points.slice(0, -1).map((from, i) => getRoute(from, points[i + 1], opts)),
  );
  const path: LatLng[] = [];
  const legPaths: LatLng[][] = [];
  let distanceM = 0;
  let durationSec = 0;
  let fallback = false;
  legs.forEach((leg, i) => {
    distanceM += leg.distanceM;
    durationSec += leg.durationSec;
    fallback = fallback || leg.fallback;
    legPaths.push(leg.path);
    // Drop the shared junction point (leg N's last == leg N+1's first).
    path.push(...(i === 0 ? leg.path : leg.path.slice(1)));
  });
  return { path, legPaths, distanceM, durationSec, fallback, mode };
}
