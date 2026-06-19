import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import { useMyTours } from '../hooks/useTours';
import AppNav from '../features/profile/AppNav';
import TourCreate from './TourCreate';

// "My tours" landing page. Lists tours the user belongs to and offers tour
// creation via a modal (REQ-F6-001).
export default function TourList() {
  const { user } = useAuth();
  const { data: tours, loading, error, reload } = useMyTours(user?.id);
  const [creating, setCreating] = useState(false);

  return (
    <main className="page page-tour-list">
      <header className="page-header">
        <h1>내 투어</h1>
        {/* Name + 정보 변경 + 로그아웃 (reuses the shared app nav). */}
        <AppNav />
      </header>

      <button type="button" onClick={() => setCreating(true)}>
        새 투어 만들기
      </button>

      {loading && <p className="muted">불러오는 중...</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!loading && tours.length === 0 && (
        <p className="muted">아직 참여 중인 투어가 없습니다. 새 투어를 만들어 보세요.</p>
      )}

      <ul className="tour-list">
        {tours.map((t) => (
          <li key={t.id}>
            <Link to={`/tours/${t.id}`}>{t.name}</Link>
          </li>
        ))}
      </ul>

      {creating && (
        <TourCreate
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </main>
  );
}
