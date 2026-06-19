// Ambient declarations for the Kakao Maps SDK global.
//
// The SDK attaches a `kakao` object to `window` once the script loads and
// `kakao.maps.load(cb)` finishes. Slice B uses the map, markers, a numbered
// order overlay (CustomOverlay), a connecting Polyline, and marker click events
// (F3). The surface below is intentionally minimal -- only what Slice B uses.
// Directions/route APIs (services.Directions) arrive with F2 in Slice C.

declare global {
  interface KakaoLatLng {
    getLat(): number;
    getLng(): number;
  }

  interface KakaoLatLngBounds {
    extend(latlng: KakaoLatLng): void;
  }

  interface KakaoMap {
    setBounds(bounds: KakaoLatLngBounds): void;
    setCenter(latlng: KakaoLatLng): void;
    relayout(): void;
  }

  interface KakaoMarker {
    setMap(map: KakaoMap | null): void;
    // Reposition an existing marker (used by the location picker so a single
    // marker follows successive map clicks / search selections, A8).
    setPosition(latlng: KakaoLatLng): void;
  }

  // Payload delivered to a map 'click' event listener. `latLng` is the clicked
  // geographic point; the location picker reads getLat()/getLng() from it.
  interface KakaoMouseEvent {
    latLng: KakaoLatLng;
  }

  interface KakaoCustomOverlay {
    setMap(map: KakaoMap | null): void;
  }

  // Constructor / setOptions shape for a Circle overlay. `radius` is in metres.
  interface KakaoCircleOptions {
    center: KakaoLatLng;
    radius: number;
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    fillColor?: string;
    fillOpacity?: number;
    zIndex?: number;
    map?: KakaoMap;
  }

  interface KakaoPolyline {
    setMap(map: KakaoMap | null): void;
  }

  // Circle overlay. Used by MapView for the live "내 위치" indicator: a small
  // filled blue dot at the user's position plus an optional larger translucent
  // circle of the fix's accuracy radius (metres). Kept reusable so the marker
  // can be repositioned/resized in place as the position changes.
  interface KakaoCircle {
    setMap(map: KakaoMap | null): void;
    setPosition(latlng: KakaoLatLng): void;
    setRadius(radius: number): void;
    setOptions(options: KakaoCircleOptions): void;
  }

  interface KakaoMapsEvent {
    // The map 'click' listener receives a KakaoMouseEvent; marker 'click'
    // receives nothing. A loose handler signature covers both call sites.
    addListener(
      target: unknown,
      type: string,
      handler: (event?: KakaoMouseEvent) => void,
    ): void;
  }

  // --- services library (geocoder / directions) ---------------------------
  // Slice C (F2) uses a thin route call. The Kakao JS SDK's `services` library
  // exposes Geocoder/Places; turn-by-turn driving routes come from the Kakao
  // Mobility REST API. We model the minimal shape our directions layer consumes
  // (a list of route sections with distance in metres + duration in seconds)
  // so the call can be mocked and the straight-line fallback (A11) is typed.
  interface KakaoRouteSummary {
    distance: number; // metres
    duration: number; // seconds
  }
  interface KakaoRouteVertexes {
    vertexes: number[]; // flat [lng, lat, lng, lat, ...]
  }
  interface KakaoRouteSection {
    distance: number;
    duration: number;
    roads?: KakaoRouteVertexes[];
  }
  interface KakaoRoute {
    summary: KakaoRouteSummary;
    sections: KakaoRouteSection[];
  }
  interface KakaoDirectionsResponse {
    routes: KakaoRoute[];
  }

  // A single result from Places.keywordSearch. Kakao returns coordinates as
  // strings: `x` is longitude, `y` is latitude.
  interface KakaoPlaceResult {
    place_name: string;
    x: string; // longitude
    y: string; // latitude
    address_name?: string;
    road_address_name?: string;
  }

  // Status codes passed to the keywordSearch callback.
  type KakaoPlacesStatus = 'OK' | 'ZERO_RESULT' | 'ERROR';

  // Places keyword search service (libraries=services). The picker uses this
  // for "type a name -> pick a result" location selection (A8).
  interface KakaoPlaces {
    keywordSearch(
      keyword: string,
      callback: (data: KakaoPlaceResult[], status: KakaoPlacesStatus) => void,
    ): void;
  }

  interface KakaoServices {
    // Optional helpers; only what the directions layer may call. The actual
    // route fetch is wrapped in src/features/directions/api.ts so it stays
    // mockable and independent of whichever transport Kakao exposes.
    status?: { OK: string; ZERO_RESULT: string; ERROR: string };
    Places?: new () => KakaoPlaces;
    [key: string]: unknown;
  }

  interface KakaoMaps {
    /**
     * Defers the callback until the maps library (and any sub-libraries
     * requested via the `libraries` query param, e.g. `services`) are ready.
     */
    load(callback: () => void): void;
    LatLng: new (lat: number, lng: number) => KakaoLatLng;
    LatLngBounds: new () => KakaoLatLngBounds;
    Map: new (
      container: HTMLElement,
      options: { center: KakaoLatLng; level?: number },
    ) => KakaoMap;
    Marker: new (options: {
      position: KakaoLatLng;
      map?: KakaoMap;
      title?: string;
      // The location picker drops a draggable marker so the user can fine-tune
      // the pinned point after a click or search (A8).
      draggable?: boolean;
    }) => KakaoMarker;
    CustomOverlay: new (options: {
      position: KakaoLatLng;
      content: string | HTMLElement;
      map?: KakaoMap;
      yAnchor?: number;
      zIndex?: number;
    }) => KakaoCustomOverlay;
    Polyline: new (options: {
      path: KakaoLatLng[];
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      // Layer order: the directions route line is drawn above the spot-order
      // connector (F2 route overlay) so the real road curve stays on top.
      zIndex?: number;
      map?: KakaoMap;
    }) => KakaoPolyline;
    Circle: new (options: KakaoCircleOptions) => KakaoCircle;
    event: KakaoMapsEvent;
    // Services library (geocoder/directions) requested via `libraries=services`.
    services?: KakaoServices;
    [key: string]: unknown;
  }

  interface KakaoNamespace {
    maps: KakaoMaps;
  }

  interface Window {
    kakao?: KakaoNamespace;
  }
}

export {};
