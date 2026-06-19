import { useContext } from 'react';
import { AuthContext } from './auth-context';
import type { AuthContextValue } from './auth-context';

// @MX:ANCHOR: [AUTO] useAuth is the single accessor for auth state across the
// app (Login, ProtectedRoute, TourList, TourDetail, InviteAccept all consume it).
// @MX:REASON: high fan_in — every authed surface depends on this contract;
// it must always be called inside an AuthProvider or it throws to fail loudly.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
