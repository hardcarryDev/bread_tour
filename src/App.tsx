import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import { AuthProvider } from './features/auth/AuthProvider';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { ToastProvider } from './features/collab/ToastProvider';
import Login from './pages/Login';
import TourList from './pages/TourList';
import TourDetail from './pages/TourDetail';
import InviteAccept from './pages/InviteAccept';
import ProfileEdit from './pages/ProfileEdit';

// App shell: AuthProvider wraps the router so every route can read auth state.
// All tour routes are protected (REQ-F5-001 / REQ-F5-006). Slice A covers auth
// + tour lifecycle; spots/map/stamp/realtime routes arrive in later slices.
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/tours"
        element={
          <ProtectedRoute>
            <TourList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tours/:tourId"
        element={
          <ProtectedRoute>
            <TourDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/invite/:token"
        element={
          <ProtectedRoute>
            <InviteAccept />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfileEdit />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/tours" replace />} />
      <Route path="*" element={<Navigate to="/tours" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      {/* basename derives from Vite's `base` (import.meta.env.BASE_URL). It is
          '/' for local dev and root deployments, and '/<repo>/' on GitHub Pages
          project sites, so deep links resolve correctly under the subpath. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        {/* App-level toast host so Login can show a signup-success toast that
            survives the immediate redirect into the app (Feature 2). */}
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
