import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useProfiles } from './useProfiles';
import { displayNameFor } from './api';

// Lightweight, mobile-friendly app nav shown on the main pages (TourList /
// TourDetail). Surfaces the current user's display name, a "정보 변경" link to
// the profile edit page, and a 로그아웃 button. Because it mounts fresh on each
// page, useProfiles re-reads the caller's name on navigation, so the updated
// name appears here right after a save without any explicit cache busting.
export default function AppNav() {
  const { user, signOut } = useAuth();

  // Stable single-id array so the useProfiles effect key is steady.
  const ids = useMemo(() => (user?.id ? [user.id] : []), [user?.id]);
  const names = useProfiles(ids);
  const myName = displayNameFor(user?.id, names);

  return (
    <nav className="app-nav" aria-label="사용자 메뉴">
      <span className="app-nav-name">{myName}</span>
      <Link className="app-nav-link" to="/profile">
        정보 변경
      </Link>
      <button type="button" className="link-button" onClick={() => signOut()}>
        로그아웃
      </button>
    </nav>
  );
}
