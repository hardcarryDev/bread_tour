// Supabase Edge Function: directions (SPEC-BREADTOUR-001 / F2).
//
// Server-side directions proxy supporting THREE travel modes:
//   - "car"     -> Kakao Mobility directions REST API   (KAKAO_REST_API_KEY)
//   - "walk"    -> TMAP pedestrian routing              (TMAP_APP_KEY)
//   - "transit" -> TMAP public transit routing          (TMAP_APP_KEY)
//
// All provider REST keys live ONLY in this function's secrets and are never
// shipped to the browser bundle. The Kakao JavaScript map key is unrelated and
// stays client-side for map rendering.
//
// Security model:
//   - The caller MUST be an authenticated member: we read the incoming
//     Authorization bearer JWT and resolve the user via the ANON-key client
//     (auth.getUser). No user -> 401. We deliberately do NOT use the
//     service-role key here, so this endpoint never bypasses RLS or grants more
//     than the caller already has.
//   - Provider REST keys are read from Deno.env (function secrets) only.
//
// Contract (request):
//   POST {
//     mode?: "car" | "walk" | "transit",   // default "car" (backward compat)
//     origin: {lat,lng},
//     destination: {lat,lng},
//     waypoints?: {lat,lng}[]               // car only (ignored by walk/transit)
//   }
//
// Contract (response, normalized to a COMMON shape the client can render):
//   200 {
//     mode: "car" | "walk" | "transit",
//     path: {lat,lng}[],
//     distanceM: number,           // metres
//     durationSec: number,         // seconds
//     fallback: false,
//     // transit-only (omitted for car & walk):
//     legs?: { mode, sectionTime, distance?, route?, startName?, endName? }[],
//     fare?: number,               // total fare if available
//     transferCount?: number,
//     totalWalkTime?: number
//   }
//   4xx/5xx { error: string }   -> the client applies its straight-line fallback.
//
// distanceM is metres and durationSec is seconds; the client formats minutes
// itself in route.ts. The car path is 100% backward-compatible: a request with
// no `mode` (or mode "car") behaves exactly as before plus an added `mode` field.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type TravelMode = 'car' | 'walk' | 'transit';

interface LatLng {
  lat: number;
  lng: number;
}

interface DirectionsRequest {
  mode?: TravelMode;
  origin: LatLng;
  destination: LatLng;
  waypoints?: LatLng[];
}

// Optional per-leg breakdown for transit so the UI can show the itinerary.
interface TransitLeg {
  mode: string;
  sectionTime: number;
  distance?: number;
  route?: string;
  startName?: string;
  endName?: string;
}

// Common response contract. Transit-only fields are omitted for car & walk.
interface RouteResponse {
  mode: TravelMode;
  path: LatLng[];
  distanceM: number;
  durationSec: number;
  fallback: boolean;
  legs?: TransitLeg[];
  fare?: number;
  transferCount?: number;
  totalWalkTime?: number;
}

const KAKAO_DIRECTIONS_URL = 'https://apis-navi.kakaomobility.com/v1/directions';
const TMAP_PEDESTRIAN_URL =
  'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';
const TMAP_TRANSIT_URL = 'https://apis.openapi.sk.com/transit/routes';

// CORS: allow the browser SPA to call the function (incl. preflight). The
// Authorization + apikey headers are attached by supabase-js functions.invoke.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isLatLng(v: unknown): v is LatLng {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as LatLng).lat === 'number' &&
    typeof (v as LatLng).lng === 'number' &&
    Number.isFinite((v as LatLng).lat) &&
    Number.isFinite((v as LatLng).lng)
  );
}

function isTravelMode(v: unknown): v is TravelMode {
  return v === 'car' || v === 'walk' || v === 'transit';
}

// =====================================================================
// CAR — Kakao Mobility directions
// =====================================================================

// Minimal shape of the Kakao Mobility directions response we consume.
interface KakaoDirectionsResult {
  routes: Array<{
    result_code?: number;
    summary?: { distance: number; duration: number };
    sections?: Array<{
      distance: number;
      duration: number;
      roads?: Array<{ vertexes: number[] }>;
    }>;
  }>;
}

// Decode Kakao's flat [lng, lat, lng, lat, ...] vertex arrays into points.
function decodeKakaoVertexes(result: KakaoDirectionsResult): LatLng[] {
  const points: LatLng[] = [];
  const sections = result.routes[0]?.sections ?? [];
  for (const section of sections) {
    for (const road of section.roads ?? []) {
      const v = road.vertexes ?? [];
      for (let i = 0; i + 1 < v.length; i += 2) {
        points.push({ lng: v[i], lat: v[i + 1] });
      }
    }
  }
  return points;
}

async function routeCar(
  origin: LatLng,
  destination: LatLng,
  waypoints: LatLng[],
  kakaoKey: string,
): Promise<RouteResponse> {
  const params = new URLSearchParams({
    origin: `${origin.lng},${origin.lat}`,
    destination: `${destination.lng},${destination.lat}`,
  });
  if (waypoints.length > 0) {
    // Kakao expects waypoints as "lng,lat|lng,lat".
    params.set('waypoints', waypoints.map((w) => `${w.lng},${w.lat}`).join('|'));
  }

  let kakaoResult: KakaoDirectionsResult;
  try {
    const kakaoRes = await fetch(`${KAKAO_DIRECTIONS_URL}?${params.toString()}`, {
      headers: { Authorization: `KakaoAK ${kakaoKey}` },
    });
    if (!kakaoRes.ok) {
      throw new ProviderError(`Kakao directions failed: ${kakaoRes.status}`, 502);
    }
    kakaoResult = (await kakaoRes.json()) as KakaoDirectionsResult;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`Kakao directions request error: ${String(e)}`, 502);
  }

  const route = kakaoResult.routes?.[0];
  const summary = route?.summary;
  const path = decodeKakaoVertexes(kakaoResult);
  // Kakao uses result_code 0 for success; any non-zero (or missing route) means
  // no usable route -> tell the client so it can draw a straight line.
  if (
    !route ||
    (route.result_code !== undefined && route.result_code !== 0) ||
    !summary ||
    path.length < 2
  ) {
    throw new ProviderError('No usable route from Kakao', 422);
  }

  return {
    mode: 'car',
    path,
    distanceM: summary.distance,
    durationSec: summary.duration,
    fallback: false,
  };
}

// =====================================================================
// WALK — TMAP pedestrian (GeoJSON FeatureCollection)
// =====================================================================

interface TmapPedestrianResult {
  features?: Array<{
    geometry?: {
      type?: string;
      // LineString coords are [[lng,lat], ...]; Point coords are [lng,lat].
      coordinates?: number[][] | number[];
    };
    properties?: {
      totalDistance?: number;
      totalTime?: number;
    };
  }>;
}

async function routeWalk(
  origin: LatLng,
  destination: LatLng,
  tmapKey: string,
): Promise<RouteResponse> {
  const body = {
    startX: origin.lng,
    startY: origin.lat,
    endX: destination.lng,
    endY: destination.lat,
    startName: '출발',
    endName: '도착',
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    searchOption: '0',
  };

  let result: TmapPedestrianResult;
  try {
    const res = await fetch(TMAP_PEDESTRIAN_URL, {
      method: 'POST',
      headers: {
        appKey: tmapKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new ProviderError(`TMAP pedestrian failed: ${res.status}`, 502);
    }
    result = (await res.json()) as TmapPedestrianResult;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`TMAP pedestrian request error: ${String(e)}`, 502);
  }

  const features = result.features ?? [];
  // Concatenate every LineString feature into a single drawable path.
  const path: LatLng[] = [];
  for (const feature of features) {
    if (feature.geometry?.type !== 'LineString') continue;
    const coords = feature.geometry.coordinates as number[][] | undefined;
    if (!Array.isArray(coords)) continue;
    for (const c of coords) {
      if (Array.isArray(c) && c.length >= 2) {
        path.push({ lng: c[0], lat: c[1] });
      }
    }
  }

  // The first feature carrying totals gives distance (m) and time (s).
  let distanceM = 0;
  let durationSec = 0;
  for (const feature of features) {
    const p = feature.properties;
    if (p && (p.totalDistance !== undefined || p.totalTime !== undefined)) {
      distanceM = p.totalDistance ?? 0;
      durationSec = p.totalTime ?? 0;
      break;
    }
  }

  if (path.length < 2) {
    throw new ProviderError('No usable walking route from TMAP', 422);
  }

  return {
    mode: 'walk',
    path,
    distanceM,
    durationSec,
    fallback: false,
  };
}

// =====================================================================
// TRANSIT — TMAP public transit
// =====================================================================

interface TmapTransitLeg {
  mode?: string;
  sectionTime?: number;
  distance?: number;
  route?: string;
  start?: { name?: string; lon?: number; lat?: number };
  end?: { name?: string; lon?: number; lat?: number };
  passShape?: { linestring?: string };
}

interface TmapTransitItinerary {
  totalTime?: number;
  totalDistance?: number;
  totalWalkTime?: number;
  transferCount?: number;
  fare?: { regular?: { totalFare?: number } };
  legs?: TmapTransitLeg[];
}

interface TmapTransitResult {
  // On "no route" TMAP returns a result object instead of metaData.
  result?: { status?: number; message?: string };
  metaData?: {
    plan?: {
      itineraries?: TmapTransitItinerary[];
    };
  };
}

// Parse a TMAP passShape linestring ("lng,lat lng,lat ...") into points.
function parseLinestring(linestring: string): LatLng[] {
  const points: LatLng[] = [];
  for (const pair of linestring.trim().split(/\s+/)) {
    const [lngStr, latStr] = pair.split(',');
    const lng = Number(lngStr);
    const lat = Number(latStr);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      points.push({ lng, lat });
    }
  }
  return points;
}

async function routeTransit(
  origin: LatLng,
  destination: LatLng,
  tmapKey: string,
): Promise<RouteResponse> {
  const body = {
    startX: String(origin.lng),
    startY: String(origin.lat),
    endX: String(destination.lng),
    endY: String(destination.lat),
    count: 5,
    lang: 0,
    format: 'json',
  };

  let result: TmapTransitResult;
  try {
    const res = await fetch(TMAP_TRANSIT_URL, {
      method: 'POST',
      headers: {
        appKey: tmapKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new ProviderError(`TMAP transit failed: ${res.status}`, 502);
    }
    result = (await res.json()) as TmapTransitResult;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(`TMAP transit request error: ${String(e)}`, 502);
  }

  const itineraries = result.metaData?.plan?.itineraries ?? [];
  // No itineraries means TMAP found no transit route (e.g. too short / no data).
  const itinerary = itineraries[0];
  if (!itinerary) {
    throw new ProviderError('No usable transit route from TMAP', 422);
  }

  const rawLegs = itinerary.legs ?? [];
  const path: LatLng[] = [];
  const legs: TransitLeg[] = [];
  for (const leg of rawLegs) {
    // Geometry: transit legs carry passShape; WALK legs often lack it, so fall
    // back to the leg's start/end points to keep the polyline continuous.
    const linestring = leg.passShape?.linestring;
    if (linestring) {
      path.push(...parseLinestring(linestring));
    } else {
      if (leg.start && leg.start.lon !== undefined && leg.start.lat !== undefined) {
        path.push({ lng: leg.start.lon, lat: leg.start.lat });
      }
      if (leg.end && leg.end.lon !== undefined && leg.end.lat !== undefined) {
        path.push({ lng: leg.end.lon, lat: leg.end.lat });
      }
    }

    legs.push({
      mode: leg.mode ?? 'UNKNOWN',
      sectionTime: leg.sectionTime ?? 0,
      distance: leg.distance,
      route: leg.route,
      startName: leg.start?.name,
      endName: leg.end?.name,
    });
  }

  if (path.length < 2) {
    throw new ProviderError('No usable transit geometry from TMAP', 422);
  }

  const response: RouteResponse = {
    mode: 'transit',
    path,
    distanceM: itinerary.totalDistance ?? 0,
    durationSec: itinerary.totalTime ?? 0,
    fallback: false,
    legs,
  };
  const fare = itinerary.fare?.regular?.totalFare;
  if (fare !== undefined) response.fare = fare;
  if (itinerary.transferCount !== undefined) {
    response.transferCount = itinerary.transferCount;
  }
  if (itinerary.totalWalkTime !== undefined) {
    response.totalWalkTime = itinerary.totalWalkTime;
  }
  return response;
}

// =====================================================================
// Shared error type: carries the HTTP status the client should see.
// =====================================================================

class ProviderError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

// @MX:ANCHOR: [AUTO] HTTP entry point for all directions modes; dispatches to
// the car/walk/transit providers and normalizes every provider response to the
// single RouteResponse contract the client renders.
// @MX:REASON: REQ-F2 — this is the only server boundary the client calls for
// routing; the response shape must stay stable across all three modes or the
// map/UI breaks, and the auth/secret handling here is the security boundary.
Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // --- Auth: require a valid user JWT (no service-role key). ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Server not configured' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // --- Parse + validate request body. ---
  let body: DirectionsRequest;
  try {
    body = (await req.json()) as DirectionsRequest;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!isLatLng(body.origin) || !isLatLng(body.destination)) {
    return jsonResponse(
      { error: 'origin and destination must be {lat,lng}' },
      400,
    );
  }

  // Default to "car" for backward compatibility.
  const mode: TravelMode = body.mode === undefined ? 'car' : body.mode;
  if (!isTravelMode(mode)) {
    return jsonResponse(
      { error: 'mode must be one of "car" | "walk" | "transit"' },
      400,
    );
  }

  const waypoints = Array.isArray(body.waypoints)
    ? body.waypoints.filter(isLatLng)
    : [];

  // --- Provider keys from function secrets only. Distinguish "not configured"
  //     (500) from "no route" (422) so the client can show a clear message. ---
  try {
    let result: RouteResponse;
    if (mode === 'car') {
      const kakaoKey = Deno.env.get('KAKAO_REST_API_KEY');
      if (!kakaoKey) {
        return jsonResponse(
          { error: 'Directions service not configured (KAKAO_REST_API_KEY)' },
          500,
        );
      }
      result = await routeCar(body.origin, body.destination, waypoints, kakaoKey);
    } else {
      const tmapKey = Deno.env.get('TMAP_APP_KEY');
      if (!tmapKey) {
        return jsonResponse(
          { error: 'Directions service not configured (TMAP_APP_KEY)' },
          500,
        );
      }
      result =
        mode === 'walk'
          ? await routeWalk(body.origin, body.destination, tmapKey)
          : await routeTransit(body.origin, body.destination, tmapKey);
    }
    return jsonResponse(result, 200);
  } catch (e) {
    if (e instanceof ProviderError) {
      return jsonResponse({ error: e.message }, e.status);
    }
    return jsonResponse({ error: `Directions error: ${String(e)}` }, 500);
  }
});
