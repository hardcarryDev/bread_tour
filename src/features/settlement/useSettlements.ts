// Loads a tour's settlements and keys them by spot_id for the UI
// (SPEC-BREADTOUR-001 / F-정산). Mirrors useStamps: one load point so the detail
// page feeds the per-row caption, the modal's `existing` value, and the tour
// summary from a single source of truth. reload() bumps a nonce to refetch after
// a save/delete; Slice D realtime can call reload() without changing this shape.

import { useCallback, useEffect, useState } from 'react';
import { listSettlements } from './api';
import type { SpotSettlement } from '../../types/database';

interface SettlementsState {
  // spot_id -> the single settlement for that spot (one row per spot).
  settlementBySpot: Record<string, SpotSettlement>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useSettlements(
  tourId: string | undefined,
): SettlementsState {
  const [settlementBySpot, setSettlementBySpot] = useState<
    Record<string, SpotSettlement>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!tourId) {
      setSettlementBySpot({});
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    listSettlements(tourId)
      .then((rows) => {
        if (!active) return;
        const map: Record<string, SpotSettlement> = {};
        for (const row of rows) map[row.spot_id] = row;
        setSettlementBySpot(map);
        setError(null);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tourId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { settlementBySpot, loading, error, reload };
}
