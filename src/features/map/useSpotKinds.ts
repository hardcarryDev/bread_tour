import { useCallback, useEffect, useState } from 'react';
import { addSpotKind, listSpotKinds } from './api';

interface SpotKindsState {
  kinds: string[];
  loading: boolean;
  error: string | null;
  // Persist a new 종류 option for the tour and append it locally. A blank or
  // already-present label is a no-op so the "종류 추가" button is idempotent.
  addKind: (name: string) => Promise<void>;
}

// Load and manage a tour's selectable 종류 list (migration 10). The spot form
// consumes `kinds` for its dropdown and `addKind` for the "종류 추가" button.
export function useSpotKinds(tourId: string | undefined): SpotKindsState {
  const [kinds, setKinds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tourId) {
      setKinds([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    listSpotKinds(tourId)
      .then((loaded) => {
        if (!active) return;
        setKinds(loaded);
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
  }, [tourId]);

  const addKind = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!tourId || trimmed.length === 0 || kinds.includes(trimmed)) return;
      await addSpotKind(tourId, trimmed);
      setKinds((current) =>
        current.includes(trimmed) ? current : [...current, trimmed],
      );
    },
    [tourId, kinds],
  );

  return { kinds, loading, error, addKind };
}
