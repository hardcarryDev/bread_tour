// App-level toast context (SPEC-BREADTOUR-001 / Feature 2).
//
// Exported separately from ToastProvider so fast-refresh only sees a component
// export in ToastProvider.tsx (mirrors the auth-context / AuthProvider split).

import { createContext, useContext } from 'react';

export interface ToastContextValue {
  // Push a toast message; returns its id so callers can dismiss it early.
  push: (message: string) => string;
}

export const ToastContext = createContext<ToastContextValue | undefined>(
  undefined,
);

// Read the app-level toast pusher. Returns a no-op when used outside a provider
// so unit tests that render a page in isolation do not need the provider.
export function useGlobalToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? { push: () => '' };
}
