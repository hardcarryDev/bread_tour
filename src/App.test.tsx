import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// App now mounts AuthProvider, which reads the Supabase auth session on init.
// Mock the client so no real network call happens and the user is anonymous.
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: null } }),
      ),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

import App from './App';

describe('App', () => {
  it('renders the login screen for an anonymous user (REQ-F5-006)', async () => {
    render(<App />);
    // Unauthenticated users hitting "/" are redirected to the protected
    // /tours route, which in turn redirects to /login.
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: '빵투어', level: 1 }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: '로그인' }),
    ).toBeInTheDocument();
  });
});
