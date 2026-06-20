import { useEffect, useRef, useState } from 'react';
import { loadKakaoMaps } from '../../lib/kakao';

export interface PickedLocation {
  lat: number;
  lng: number;
  name?: string;
}

interface LocationPickerProps {
  // Returns the chosen coordinate (and optional place name from search) when
  // the user confirms. Replaces SpotForm's old hardcoded Seoul pin (A8).
  onConfirm: (location: PickedLocation) => void;
  onCancel: () => void;
  // Optional starting centre; defaults to Daejeon (a sensible bread-tour hub).
  initial?: { lat: number; lng: number };
}

interface SearchResult {
  name: string;
  lat: number;
  lng: number;
  // Extra place info shown in the marker info bubble (A8). Rating/reviews are
  // NOT exposed by the Places API, so `placeUrl` deep-links into the full Kakao
  // place page where those live.
  category?: string;
  address?: string;
  phone?: string;
  placeUrl?: string;
}

// Escape user-visible Kakao strings before injecting into the InfoWindow's HTML
// content (place names can contain &, <, > and would otherwise break markup).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Build the marker info bubble: name + category + address + phone + a link into
// the full Kakao place page (which carries rating/reviews/photos).
function buildInfoContent(place: SearchResult): string {
  const rows: string[] = [
    `<strong class="picker-iw-name">${escapeHtml(place.name)}</strong>`,
  ];
  if (place.category) {
    rows.push(`<span class="picker-iw-cat">${escapeHtml(place.category)}</span>`);
  }
  if (place.address) {
    rows.push(`<span class="picker-iw-addr">${escapeHtml(place.address)}</span>`);
  }
  if (place.phone) {
    rows.push(`<span class="picker-iw-tel">${escapeHtml(place.phone)}</span>`);
  }
  if (place.placeUrl) {
    rows.push(
      `<a class="picker-iw-link" href="${escapeHtml(place.placeUrl)}" target="_blank" rel="noopener noreferrer">상세보기 (평점·리뷰)</a>`,
    );
  }
  return `<div class="picker-iw">${rows.join('')}</div>`;
}

// Default map centre when no initial coordinate is supplied. Daejeon city —
// home of 성심당, a fitting default for a bread tour.
const DEFAULT_CENTER = { lat: 36.3504, lng: 127.3845 };

// @MX:ANCHOR: [AUTO] LocationPicker is the single interactive map surface for
// choosing a spot's coordinate (click-to-pin + Kakao Places keyword search).
// @MX:REASON: A8 / AC-F1-06 — every spot's lat/lng now originates here; SpotForm
// and any future "pick a location" caller depend on this onConfirm contract,
// so the {lat,lng,name?} shape and the load-via-src/lib/kakao loader are invariant.
export default function LocationPicker({
  onConfirm,
  onCancel,
  initial,
}: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const kakaoRef = useRef<KakaoNamespace | null>(null);
  const markerRef = useRef<KakaoMarker | null>(null);
  const infoWindowRef = useRef<KakaoInfoWindow | null>(null);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [coord, setCoord] = useState<PickedLocation | null>(null);

  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  // Load the Kakao SDK once, create the map, and wire the click-to-pin handler.
  useEffect(() => {
    let active = true;
    loadKakaoMaps()
      .then((kakao) => {
        if (!active || !containerRef.current) return;
        kakaoRef.current = kakao;
        const start = initial ?? DEFAULT_CENTER;
        const center = new kakao.maps.LatLng(start.lat, start.lng);
        const map = new kakao.maps.Map(containerRef.current, {
          center,
          level: 4,
        });
        mapRef.current = map;

        // Click anywhere on the map to drop / move the marker (A8).
        kakao.maps.event.addListener(map, 'click', (event) => {
          if (!event) return;
          placePin(event.latLng.getLat(), event.latLng.getLng());
        });

        setReady(true);
      })
      .catch((e: unknown) => {
        if (active) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
      infoWindowRef.current?.close();
    };
    // The map is created once on mount; subsequent state changes drive markers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drop or move the single draggable marker and record the coordinate. When a
  // search result `place` is supplied, open an info bubble on the marker; a raw
  // map click has no place data, so any stale bubble is closed instead.
  function placePin(lat: number, lng: number, place?: SearchResult) {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (!kakao || !map) return;

    const pos = new kakao.maps.LatLng(lat, lng);
    if (markerRef.current) {
      markerRef.current.setPosition(pos);
    } else {
      const marker = new kakao.maps.Marker({ position: pos, draggable: true });
      marker.setMap(map);
      markerRef.current = marker;
    }
    map.setCenter(pos);
    setCoord({ lat, lng, name: place?.name });

    infoWindowRef.current?.close();
    if (place) {
      const infoWindow =
        infoWindowRef.current ??
        new kakao.maps.InfoWindow({ removable: true, zIndex: 1 });
      infoWindow.setContent(buildInfoContent(place));
      infoWindow.open(map, markerRef.current ?? undefined);
      infoWindowRef.current = infoWindow;
    }
  }

  // Kakao Places keyword search: type a name -> list results -> pick one (A8).
  // NOT a form submit handler: this picker renders inside SpotForm's <form>, so a
  // nested <form> / submit button (or Enter implicit-submit) would submit the
  // OUTER form and close the picker before searching (the "맵이 닫히기만 함" bug).
  // Search is therefore driven by a plain button onClick + an explicit Enter
  // handler that calls preventDefault.
  function runSearch() {
    const kakao = kakaoRef.current;
    const term = keyword.trim();
    if (!kakao?.maps.services?.Places || term.length === 0) return;

    const places = new kakao.maps.services.Places();
    places.keywordSearch(term, (data, status) => {
      setSearched(true);
      if (status !== 'OK' || data.length === 0) {
        setResults([]);
        return;
      }
      setResults(
        data.map((p) => ({
          name: p.place_name,
          lat: Number(p.y),
          lng: Number(p.x),
          category: p.category_name,
          address: p.road_address_name || p.address_name,
          phone: p.phone,
          placeUrl: p.place_url,
        })),
      );
    });
  }

  function selectResult(r: SearchResult) {
    placePin(r.lat, r.lng, r);
    setResults([]);
    setSearched(false);
  }

  return (
    <div
      className="location-picker-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="지도에서 위치 선택"
    >
      <div className="location-picker">
        <div className="location-picker-search">
          <input
            type="search"
            data-testid="picker-search-input"
            // Show a "검색"/Search action on the mobile keyboard instead of the
            // default "다음"/Next: the input sits inside SpotForm's <form> with
            // later fields, so mobile browsers offer a focus-advancing "Next"
            // key that never fires Enter (web Enter works, mobile "다음" did not).
            // The Search action fires Enter, which onKeyDown turns into a search.
            enterKeyHint="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              // Enter (web) / the mobile "검색" action searches in place;
              // preventDefault stops the surrounding SpotForm <form> from
              // submitting (which would close the picker).
              if (e.key === 'Enter') {
                e.preventDefault();
                runSearch();
              }
            }}
            placeholder="장소 이름 검색 (예: 성심당)"
            aria-label="장소 검색"
          />
          <button
            type="button"
            data-testid="picker-search-submit"
            onClick={runSearch}
          >
            검색
          </button>
        </div>

        {results.length > 0 && (
          <ul className="location-picker-results" data-testid="picker-results">
            {results.map((r, i) => (
              <li key={`${r.name}-${i}`}>
                <button
                  type="button"
                  className="location-picker-result"
                  onClick={() => selectResult(r)}
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {searched && results.length === 0 && (
          <p className="muted" data-testid="picker-no-results">
            검색 결과가 없습니다.
          </p>
        )}

        {loadError ? (
          <div className="map-view-error" role="alert">
            지도를 불러오지 못했습니다. 검색으로 위치를 선택하거나 취소하세요.
          </div>
        ) : (
          <div
            ref={containerRef}
            className="location-picker-canvas"
            data-testid="picker-canvas"
            aria-label="위치 선택 지도"
          />
        )}

        <p className="location-picker-hint muted">
          {ready
            ? '지도를 눌러 위치를 지정하거나 검색 결과를 선택하세요.'
            : '지도를 불러오는 중...'}
        </p>

        {coord && (
          <span className="muted" data-testid="picker-coord">
            {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
          </span>
        )}

        <div className="location-picker-actions">
          <button
            type="button"
            data-testid="picker-confirm"
            disabled={!coord}
            onClick={() => coord && onConfirm(coord)}
          >
            이 위치로 선택
          </button>
          <button
            type="button"
            className="link-button"
            data-testid="picker-cancel"
            onClick={onCancel}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
