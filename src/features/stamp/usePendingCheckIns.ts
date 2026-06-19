// Loads a tour's PENDING manual check-in requests (SPEC-BREADTOUR-001 /
// REQ-F1-007). Mirrors useStamps: one load point that the detail page feeds to
// the ManualCheckIn surface, and that Slice D's realtime hook refreshes via
// reload() so a request from one member appears live to the others.

import { useCallback, useEffect, useState } from 'react';
import { listPendingCheckIns } from './api';
import type { ManualCheckInRequest } from '../../types/database';

interface PendingCheckInsState {
  pendingRequests: ManualCheckInRequest[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function usePendingCheckIns(
  tourId: string | undefined,
): PendingCheckInsState {
  const [pendingRequests, setPendingRequests] = useState<
    ManualCheckInRequest[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!tourId) {
      setPendingRequests([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    listPendingCheckIns(tourId)
      .then((rows) => {
        if (!active) return;
        setPendingRequests(rows);
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
  return { pendingRequests, loading, error, reload };
}
