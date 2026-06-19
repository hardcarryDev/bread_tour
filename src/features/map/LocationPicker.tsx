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
    };
    // The map is created once on mount; subsequent state changes drive markers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drop or move the single draggable marker and record the coordinate.
  function placePin(lat: number, lng: number, name?: string) {
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
    setCoord({ lat, lng, name });
  }

  // Kakao Places keyword search: type a name -> list results -> pick one (A8).
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
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
        })),
      );
    });
  }

  function selectResult(r: SearchResult) {
    placePin(r.lat, r.lng, r.name);
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
        <form className="location-picker-search" onSubmit={handleSearch}>
          <input
            type="text"
            data-testid="picker-search-input"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="장소 이름 검색 (예: 성심당)"
            aria-label="장소 검색"
          />
          <button type="submit" data-testid="picker-search-submit">
            검색
          </button>
        </form>

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
