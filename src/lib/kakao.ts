// Typed async loader for the Kakao Maps JavaScript SDK.
//
// @MX:NOTE: [AUTO] The Kakao JS app key is a PUBLIC client key (NFR-SEC threat
// model / D10). It is injected from env and exposed in the bundle by design;
// security relies on the Kakao domain allowlist (NFR-SEC-003), not on hiding it.
//
// The SDK is loaded lazily (on demand) so it does not block initial render, and
// the `services` library is requested for directions/places features (F2/F3).

const KAKAO_SDK_BASE = '//dapi.kakao.com/v2/maps/sdk.js';
const SCRIPT_ID = 'kakao-maps-sdk';

let loadPromise: Promise<KakaoNamespace> | null = null;

/**
 * Injects the Kakao Maps SDK script and resolves with the `kakao` namespace
 * once `kakao.maps.load` has completed. Safe to call multiple times — the load
 * is memoized so the script is only injected once.
 *
 * Requires VITE_KAKAO_MAP_APP_KEY and a secure (HTTPS) context for full
 * functionality (NFR-GEO-003 / A1).
 */
export function loadKakaoMaps(): Promise<KakaoNamespace> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<KakaoNamespace>((resolve, reject) => {
    const appKey = import.meta.env.VITE_KAKAO_MAP_APP_KEY;
    if (!appKey) {
      reject(
        new Error(
          'Missing VITE_KAKAO_MAP_APP_KEY. Copy .env.example to .env and set it.',
        ),
      );
      return;
    }

    // Already loaded and initialized in this session.
    if (window.kakao?.maps) {
      resolve(window.kakao);
      return;
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => initialize(resolve, reject));
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Kakao Maps SDK script.')),
      );
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    // `autoload=false` defers init so we can call kakao.maps.load ourselves.
    // `libraries=services` loads geocoding/places + directions helpers (F2/F3).
    const params = new URLSearchParams({
      appkey: appKey,
      autoload: 'false',
      libraries: 'services',
    });
    script.src = `${KAKAO_SDK_BASE}?${params.toString()}`;
    script.async = true;
    script.addEventListener('load', () => initialize(resolve, reject));
    script.addEventListener('error', () =>
      reject(new Error('Failed to load Kakao Maps SDK script.')),
    );
    document.head.appendChild(script);
  });

  return loadPromise;
}

function initialize(
  resolve: (value: KakaoNamespace) => void,
  reject: (reason: Error) => void,
): void {
  const kakao = window.kakao;
  if (!kakao?.maps) {
    reject(new Error('Kakao Maps SDK loaded but kakao.maps is unavailable.'));
    return;
  }
  kakao.maps.load(() => resolve(kakao));
}
