// Loads display names for a set of user ids (SPEC-BREADTOUR-001 / Feature 1).
//
// Keeps the member list and presence indicator showing real names rather than
// raw UUIDs (REQ-F5-003). The id set is keyed for the effect by a stable sorted
// string so the fetch re-runs only when the actual set of ids changes, not on
// every render that produces a new array instance.

import { useEffect, useMemo, useState } from 'react';
import { listProfiles, type DisplayNameMap } from './api';

export function useProfiles(userIds: string[]): DisplayNameMap {
  const [names, setNames] = useState<DisplayNameMap>({});

  // Stable, order-independent key for the id set so the effect dependency does
  // not change when only the array reference changes.
  const key = useMemo(
    () => [...new Set(userIds)].sort().join(','),
    [userIds],
  );

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setNames({});
      return;
    }
    let active = true;
    listProfiles(ids)
      .then((map) => {
        if (active) setNames(map);
      })
      .catch(() => {
        // Names are best-effort; on failure the UI falls back to a short id
        // (REQ-F5-003). Do not surface a blocking error for a cosmetic label.
        if (active) setNames({});
      });
    return () => {
      active = false;
    };
  }, [key]);

  return names;
}
