// Loads a tour's valid stamps and derives the structures the UI needs
// (SPEC-BREADTOUR-001 / REQ-F1-005). One load point mirrors useSpots so the
// detail page can feed MapView's stampBySpot prop and the progress view from a
// single source of truth. Slice D will layer Realtime on top by calling reload()
// (or replacing this with a subscription) without changing the consumer shape.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listStamps, stampMapBySpot, type StampStatus } from './api';

interface StampsState {
  stampBySpot: Record<string, StampStatus>;
  // Spot ids with a valid stamp — fed to useGeoStamp so it skips them (F1-008).
  stampedSpotIds: Set<string>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useStamps(tourId: string | undefined): StampsState {
  const [stampBySpot, setStampBySpot] = useState<Record<string, StampStatus>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!tourId) {
      setStampBySpot({});
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    listStamps(tourId)
      .then((rows) => {
        if (!active) return;
        setStampBySpot(stampMapBySpot(rows));
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

  const stampedSpotIds = useMemo(
    () => new Set(Object.keys(stampBySpot)),
    [stampBySpot],
  );

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { stampBySpot, stampedSpotIds, loading, error, reload };
}
