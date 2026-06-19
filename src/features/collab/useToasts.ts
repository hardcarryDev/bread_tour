// Minimal non-destructive toast mechanism (SPEC-BREADTOUR-001 / NFR-CONFLICT-003).
//
// Toasts are advisory only: they never mutate or roll back data. They are used to
// tell a member that their unsynced edit was overwritten by a newer change and to
// surface the latest server value (AC-NFR-CONFLICT-02). Auto-dismiss keeps them
// from piling up; manual dismiss is also offered via ToastHost.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Toast {
  id: string;
  message: string;
}

interface UseToastsOptions {
  // Auto-dismiss delay in ms. 0 disables auto-dismiss.
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 6000;

export interface UseToastsResult {
  toasts: Toast[];
  // Returns the new toast id so callers can dismiss it programmatically.
  push: (message: string) => string;
  dismiss: (id: string) => void;
}

export function useToasts(options: UseToastsOptions = {}): UseToastsResult {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message: string): string => {
      const id = `toast-${seq.current++}`;
      setToasts((list) => [...list, { id, message }]);
      if (timeoutMs > 0) {
        const timer = setTimeout(() => dismiss(id), timeoutMs);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss, timeoutMs],
  );

  // Clear any pending timers on unmount so no callbacks fire after teardown.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}
