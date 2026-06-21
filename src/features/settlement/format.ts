// Shared currency formatting for the settlement feature (정산). Whole won only,
// localized with ko-KR grouping. Used by the modal preview, the per-row caption,
// and the tour summary so the +/− sign convention is consistent everywhere.

// Plain amount: "12,000원" (no sign). For totals where the sign is implied.
export function formatWon(amount: number): string {
  return `${Math.round(amount).toLocaleString('ko-KR')}원`;
}

// Sign-aware net: "+6,000" / "−6,000" / "0". Uses a real minus sign (−) to read
// cleanly in Korean UI. The caller appends a unit (원) where needed.
export function formatSignedWon(net: number): string {
  const rounded = Math.round(net);
  const abs = Math.abs(rounded).toLocaleString('ko-KR');
  if (rounded > 0) return `+${abs}`;
  if (rounded < 0) return `−${abs}`;
  return '0';
}
