import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

// Gate authenticated-only routes. Unauthenticated users are redirected to
// /login with the attempted path preserved so we can return after sign-in
// (REQ-F5-006 / AC-F5-01). While the initial session check runs we render a
// lightweight loading state to avoid a redirect flash.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        불러오는 중...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
