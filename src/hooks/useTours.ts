import { useCallback, useEffect, useState } from 'react';
import {
  getMyRole,
  getTour,
  listMembers,
  listMyTours,
} from '../features/tour/api';
import type { Tour, TourMember, TourMemberRole } from '../types/database';
import { errorMessage } from '../lib/errors';

interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// List the current user's tours (REQ-F6 / TourList page).
export function useMyTours(userId: string | undefined): AsyncState<Tour[]> {
  const [data, setData] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!userId) {
      setData([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    listMyTours(userId)
      .then((tours) => {
        if (active) {
          setData(tours);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}

interface TourDetailState {
  tour: Tour | null;
  members: TourMember[];
  role: TourMemberRole | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// Load a tour plus the current user's role + member list for the detail page
// and its permission gating (REQ-F6-004/005/006).
export function useTourDetail(
  tourId: string | undefined,
  userId: string | undefined,
): TourDetailState {
  const [tour, setTour] = useState<Tour | null>(null);
  const [members, setMembers] = useState<TourMember[]>([]);
  const [role, setRole] = useState<TourMemberRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!tourId || !userId) return;
    let active = true;
    setLoading(true);
    Promise.all([
      getTour(tourId),
      listMembers(tourId),
      getMyRole({ tourId, userId }),
    ])
      .then(([t, m, r]) => {
        if (!active) return;
        setTour(t);
        setMembers(m);
        setRole(r);
        setError(null);
      })
      .catch((e: unknown) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tourId, userId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { tour, members, role, loading, error, reload };
}
