// App-level toast host (SPEC-BREADTOUR-001 / Feature 2).
//
// Lifts the existing useToasts mechanism to the application root so pages that
// unmount immediately after acting — most notably Login, which redirects into
// the app the instant a session appears — can still surface a toast on the
// destination page. The toast state lives above the router, so it survives the
// route change. Reuses ToastHost for rendering to keep one toast style.

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useToasts } from './useToasts';
import ToastHost from './ToastHost';
import { ToastContext, type ToastContextValue } from './toast-context';

export function ToastProvider({ children }: { children: ReactNode }) {
  const { toasts, push, dismiss } = useToasts();
  const value = useMemo<ToastContextValue>(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
