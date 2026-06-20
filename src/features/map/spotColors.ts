// Distinct color per visit-order segment (the line from spot i to spot i+1).
//
// Used by BOTH the map connector polylines and the spot-list row connectors so
// the two always agree: segment i is the same color in both places. Colors are
// deterministic (index-based), not random, so they stay stable across renders
// and never need to be persisted — yet adjacent segments look clearly different.
//
// Hue spacing uses the golden angle (~137.5°), which spreads any number of
// segments evenly around the color wheel without repeating or clustering, so
// the route never collapses into one indistinguishable color (the old all-orange
// problem).

const GOLDEN_ANGLE = 137.508;
// Start away from the marker/brand orange so the first segment is distinct from
// the pins and the "차 경로" blue overlay.
const BASE_HUE = 200;

// hsl -> #rrggbb. Kakao Polyline strokeColor expects a hex string, so we convert
// rather than emit hsl().
function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => {
    const color = lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Color for the segment that connects spot `index` to spot `index + 1`.
export function segmentColor(index: number): string {
  const hue = (BASE_HUE + index * GOLDEN_ANGLE) % 360;
  // Mid saturation/lightness reads well on the light Kakao map tiles.
  return hslToHex(hue, 72, 45);
}
