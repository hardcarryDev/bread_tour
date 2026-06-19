import { useCallback, useEffect, useState } from 'react';
import type { Spot } from '../../types/database';
import { listSpots } from './api';
import {
  listSpotMenusForTour,
  type SpotMenuWithAuthor,
} from '../menu/api';

interface SpotsState {
  spots: Spot[];
  menusBySpot: Record<string, SpotMenuWithAuthor[]>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// Load a tour's spots (in visit order) plus the recommended-menu map for the
// whole tour in one place (REQ-F3-001 / REQ-F4-002). The detail page consumes
// this for the spot list, the map markers, and the marker summary.
export function useSpots(tourId: string | undefined): SpotsState {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [menusBySpot, setMenusBySpot] = useState<
    Record<string, SpotMenuWithAuthor[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!tourId) {
      setSpots([]);
      setMenusBySpot({});
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    listSpots(tourId)
      .then(async (loaded) => {
        if (!active) return;
        setSpots(loaded);
        const menus = await listSpotMenusForTour(loaded.map((s) => s.id));
        if (!active) return;
        setMenusBySpot(menus);
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
  return { spots, menusBySpot, loading, error, reload };
}
